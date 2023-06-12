import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  RouterSwapExecutor,
  ArrakisV2Router,
  ERC20,
  RouterSwapResolver,
  IArrakisV2,
  IGauge,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import { BigNumber, Contract } from "ethers";
import {
  getPeripheryContracts,
  deployArrakisV2,
  getFundsFromFaucet,
  createGauge,
  getArrakisResolver,
} from "../src/testEnvUtils";
import { swapAndAddTest } from "../src/swapAndAddTest";

let addresses: Addresses;

describe("ArrakisV2Router tests on DAI/WETH vault", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let owner: SignerWithAddress;

  let token0: ERC20;
  let token1: ERC20;
  let rakisToken: ERC20;
  let stRakisToken: ERC20;

  let resolver: Contract;
  let router: ArrakisV2Router;
  let swapExecutor: RouterSwapExecutor;
  let swapResolver: RouterSwapResolver;

  let vault: IArrakisV2;

  let gauge: IGauge;
  let swapExecutorBalanceEth: BigNumber | undefined;
  let routerBalanceEth: BigNumber | undefined;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet, , owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    [swapResolver, swapExecutor, router] = await getPeripheryContracts(owner);

    resolver = await getArrakisResolver(owner);

    [vault] = await deployArrakisV2(
      wallet,
      addresses.DAI,
      addresses.WETH,
      3000,
      resolver,
      walletAddress
    );

    token0 = (await ethers.getContractAt(
      "ERC20",
      await vault.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await vault.token1()
    )) as ERC20;
    rakisToken = (await ethers.getContractAt("ERC20", vault.address)) as ERC20;

    await getFundsFromFaucet(addresses.faucetDai, token0, walletAddress);
    await getFundsFromFaucet(addresses.faucetWeth, token1, walletAddress);

    [gauge, stRakisToken] = await createGauge(
      vault.address,
      wallet,
      owner.address
    );

    // await swapExecutor.connect(owner).whitelistRouter(router.address);

    swapExecutorBalanceEth = await wallet.provider?.getBalance(
      swapExecutor.address
    );
    routerBalanceEth = await wallet.provider?.getBalance(router.address);
  });

  it("#0 : should deposit funds with addLiquidity", async function () {
    const amount0In = ethers.utils.parseEther("10");
    const amount1In = ethers.utils.parseEther("10000");

    await token0.connect(wallet).approve(router.address, amount0In);
    await token1.connect(wallet).approve(router.address, amount1In);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: walletAddress,
      gauge: ethers.constants.AddressZero,
    };

    await router.addLiquidity(addLiquidityData);

    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

    const swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    const swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    const swapExecutorBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);

    const routerBalance0 = await token0.balanceOf(router.address);
    const routerBalance1 = await token1.balanceOf(router.address);
    const routerBalanceRakis = await rakisToken.balanceOf(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
  });

  it("#1 : should deposit funds and stake", async function () {
    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(router.address, amount0In);
    await token1.connect(wallet).approve(router.address, amount1In);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    const balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);
    const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

    await gauge
      .connect(wallet)
      .add_reward(token0.address, await wallet.getAddress(), {
        gasLimit: 6000000,
      });

    const rewardAmount = ethers.utils.parseEther("1000");
    await token0.connect(wallet).approve(gauge.address, rewardAmount);

    await gauge.deposit_reward_token(token0.address, rewardAmount, {
      gasLimit: 6000000,
    });

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: walletAddress,
      gauge: gauge.address,
    };

    await router.addLiquidity(addLiquidityData);

    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);
    const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.eq(balanceArrakisV2After);
    expect(balanceStakedBefore).to.be.lt(balanceStakedAfter);

    const swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    const swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    const swapExecutorBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );
    const swapExecutorBalanceStRakis = await stRakisToken.balanceOf(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceStRakis).to.equal(ethers.constants.Zero);

    const routerBalance0 = await token0.balanceOf(router.address);
    const routerBalance1 = await token1.balanceOf(router.address);
    const routerBalanceRakis = await rakisToken.balanceOf(router.address);
    const routerBalanceStRakis = await stRakisToken.balanceOf(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);

    const newStartTime1 = (await wallet.provider?.getBlock("latest"))
      ?.timestamp;
    const dayLater1 = Number(newStartTime1?.toString()) + 86400;
    await network.provider.request({
      method: "evm_mine",
      params: [dayLater1],
    });

    const claimable = await gauge.claimable_reward(
      walletAddress,
      token0.address
    );
    expect(claimable).to.be.gt(0);
  });

  it("#2 : should withdraw funds with removeLiquidity", async function () {
    const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
    expect(balanceArrakisV2Before).to.be.gt(ethers.constants.Zero);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    await rakisToken.approve(router.address, balanceArrakisV2Before);
    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceArrakisV2Before.div(2),
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: false,
      gauge: "0x0000000000000000000000000000000000000000",
    };
    await router.removeLiquidity(removeLiquidity);
    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);

    const swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    const swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    const swapExecutorBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);

    const routerBalance0 = await token0.balanceOf(router.address);
    const routerBalance1 = await token1.balanceOf(router.address);
    const routerBalanceRakis = await rakisToken.balanceOf(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
  });

  it("#3 : should unstake and withdraw funds", async function () {
    const balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);
    expect(balanceStakedBefore).to.be.gt(ethers.constants.Zero);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    await stRakisToken.approve(router.address, balanceStakedBefore);
    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceStakedBefore,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: false,
      gauge: gauge.address,
    };
    await router.removeLiquidity(removeLiquidity);
    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceStakedBefore).to.be.gt(balanceStakedAfter);
    expect(balanceStakedAfter).to.eq(0);

    const swapperBalance0 = await token0.balanceOf(swapExecutor.address);
    const swapperBalance1 = await token1.balanceOf(swapExecutor.address);
    const swapperBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );
    const swapperBalanceStRakis = await stRakisToken.balanceOf(
      swapExecutor.address
    );

    expect(swapperBalance0).to.equal(ethers.constants.Zero);
    expect(swapperBalance1).to.equal(ethers.constants.Zero);
    expect(swapperBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapperBalanceStRakis).to.equal(ethers.constants.Zero);

    const routerBalance0 = await token0.balanceOf(router.address);
    const routerBalance1 = await token1.balanceOf(router.address);
    const routerBalanceRakis = await rakisToken.balanceOf(router.address);
    const routerBalanceStRakis = await stRakisToken.balanceOf(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
  });

  it("#4 : add and remove liquidity using native ETH", async function () {
    const token1Address = await vault.token1();
    expect(token1Address.toLowerCase()).to.equal(addresses.WETH.toLowerCase());

    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(router.address, amount0In);
    await token1.connect(wallet).approve(router.address, amount1In);

    let balance0Before = await token0.balanceOf(walletAddress);
    let balance1Before = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: walletAddress,
      gauge: ethers.constants.AddressZero,
    };

    await router.addLiquidity(addLiquidityData, {
      value: amount1In,
    });

    let balance0After = await token0.balanceOf(walletAddress);
    let balance1After = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

    let swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    let swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    let swapExecutorBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );
    let swapExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceEth).to.equal(swapExecutorBalanceEthEnd);

    let routerBalance0 = await token0.balanceOf(router.address);
    let routerBalance1 = await token1.balanceOf(router.address);
    let routerBalanceRakis = await rakisToken.balanceOf(router.address);
    let routerBalanceEthEnd = await wallet.provider?.getBalance(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

    balance0Before = balance0After;
    balance1Before = balance1After;
    balanceArrakisV2Before = balanceArrakisV2After;

    // removeLiquidityETH

    await rakisToken.approve(router.address, balanceArrakisV2Before);
    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceArrakisV2Before,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: true,
      gauge: "0x0000000000000000000000000000000000000000",
    };

    await router.removeLiquidity(removeLiquidity);

    balance0After = await token0.balanceOf(walletAddress);
    balance1After = await wallet.provider?.getBalance(walletAddress);
    balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
    expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

    swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    swapExecutorBalanceRakis = await rakisToken.balanceOf(swapExecutor.address);
    swapExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceEth).to.equal(swapExecutorBalanceEthEnd);

    routerBalance0 = await token0.balanceOf(router.address);
    routerBalance1 = await token1.balanceOf(router.address);
    routerBalanceRakis = await rakisToken.balanceOf(router.address);
    routerBalanceEthEnd = await wallet.provider?.getBalance(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
  });

  it("#5 : add and remove liquidity using native ETH and staking", async function () {
    const token1Address = await vault.token1();
    expect(token1Address.toLowerCase()).to.equal(addresses.WETH.toLowerCase());

    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(router.address, amount0In);

    let balance0Before = await token0.balanceOf(walletAddress);
    let balance1Before = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
    let balanceStakedBefore = await stRakisToken.balanceOf(walletAddress);

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: walletAddress,
      gauge: gauge.address,
    };
    await router.addLiquidity(addLiquidityData, {
      value: amount1In,
    });

    let balance0After = await token0.balanceOf(walletAddress);
    let balance1After = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);
    let balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.eq(balanceArrakisV2After);
    expect(balanceStakedBefore).to.be.lt(balanceStakedAfter);

    let swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    let swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    let swapExecutorBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );
    let swapExecutorBalanceStRakis = await stRakisToken.balanceOf(
      swapExecutor.address
    );
    let swapExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceStRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceEthEnd).to.equal(swapExecutorBalanceEth);

    let routerBalance0 = await token0.balanceOf(router.address);
    let routerBalance1 = await token1.balanceOf(router.address);
    let routerBalanceRakis = await rakisToken.balanceOf(router.address);
    let routerBalanceStRakis = await stRakisToken.balanceOf(router.address);
    let routerBalanceEthEnd = await wallet.provider?.getBalance(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceEthEnd).to.equal(routerBalanceEth);

    balance0Before = balance0After;
    balance1Before = balance1After;
    balanceArrakisV2Before = balanceArrakisV2After;
    balanceStakedBefore = balanceStakedAfter;
    const balanceRewardsBefore = await token0.balanceOf(walletAddress);
    const newStartTime1 = (await wallet.provider?.getBlock("latest"))
      ?.timestamp;
    const dayLater1 = Number(newStartTime1?.toString()) + 86400;
    await network.provider.request({
      method: "evm_mine",
      params: [dayLater1],
    });

    const claimable = await gauge.claimable_reward(
      walletAddress,
      token0.address
    );
    expect(claimable).to.be.gt(0);

    await stRakisToken.approve(router.address, balanceStakedBefore);

    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceStakedBefore,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: true,
      gauge: gauge.address,
    };
    await router.removeLiquidity(removeLiquidity);

    balance0After = await token0.balanceOf(walletAddress);
    balance1After = await wallet.provider?.getBalance(walletAddress);
    balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);
    balanceStakedAfter = await stRakisToken.balanceOf(walletAddress);
    const balanceRewardsAfter = await token0.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceRewardsAfter).to.be.gt(balanceRewardsBefore);
    expect(balanceArrakisV2Before).to.be.eq(balanceArrakisV2After);
    expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

    swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    swapExecutorBalanceRakis = await rakisToken.balanceOf(swapExecutor.address);
    swapExecutorBalanceStRakis = await stRakisToken.balanceOf(
      swapExecutor.address
    );
    swapExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceStRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceEthEnd).to.equal(swapExecutorBalanceEth);

    routerBalance0 = await token0.balanceOf(router.address);
    routerBalance1 = await token1.balanceOf(router.address);
    routerBalanceRakis = await rakisToken.balanceOf(router.address);
    routerBalanceStRakis = await stRakisToken.balanceOf(router.address);
    routerBalanceEthEnd = await wallet.provider?.getBalance(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
  });

  it("#6 : tests adding liquidity using native ETH passing empty msg.value", async function () {
    const token1Address = await vault.token1();
    expect(token1Address.toLowerCase()).to.equal(addresses.WETH.toLowerCase());

    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(router.address, amount0In);
    await token1.connect(wallet).approve(router.address, 0);

    const transactionEthValue = ethers.BigNumber.from("0");

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: walletAddress,
      gauge: ethers.constants.AddressZero,
    };

    await expect(
      router.addLiquidity(addLiquidityData, {
        value: transactionEthValue,
      })
    ).to.be.reverted;
  });

  it("#7 : tests adding liquidity using native ETH passing double msg.value", async function () {
    const token1Address = await vault.token1();
    expect(token1Address.toLowerCase()).to.equal(addresses.WETH.toLowerCase());

    const amount0In = ethers.utils.parseEther("10000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(router.address, amount0In);

    let balance0Before = await token0.balanceOf(walletAddress);
    let balance1Before = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);
    let routerEthBalanceBefore = await wallet.provider?.getBalance(
      router.address
    );

    const transactionEthValue = amount1In.mul(2);
    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: walletAddress,
      gauge: ethers.constants.AddressZero,
    };
    await router.addLiquidity(addLiquidityData, {
      value: transactionEthValue,
    });

    let balance0After = await token0.balanceOf(walletAddress);
    let balance1After = await wallet.provider?.getBalance(walletAddress);
    let balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);
    const routerEthBalanceAfter = await wallet.provider?.getBalance(
      router.address
    );

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);
    expect(routerEthBalanceBefore).to.be.eq(routerEthBalanceAfter);

    let swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    let swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    let swapExecutorBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );
    let swapExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceEth).to.equal(swapExecutorBalanceEthEnd);

    let routerBalance0 = await token0.balanceOf(router.address);
    let routerBalance1 = await token1.balanceOf(router.address);
    let routerBalanceRakis = await rakisToken.balanceOf(router.address);
    let routerBalanceEthEnd = await wallet.provider?.getBalance(router.address);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceEth).to.equal(routerBalanceEthEnd);

    balance0Before = balance0After;
    balance1Before = balance1After;
    balanceArrakisV2Before = balanceArrakisV2After;
    routerEthBalanceBefore = routerEthBalanceAfter;

    // removeLiquidityETH

    await rakisToken.approve(router.address, balanceArrakisV2Before);
    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceArrakisV2Before,
      amount0Min: 0,
      amount1Min: 0,
      receiver: walletAddress,
      receiveETH: true,
      gauge: "0x0000000000000000000000000000000000000000",
    };
    await router.removeLiquidity(removeLiquidity);
    balance0After = await token0.balanceOf(walletAddress);
    balance1After = await wallet.provider?.getBalance(walletAddress);
    balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
    expect(balanceArrakisV2After).to.equal(ethers.constants.Zero);

    swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    swapExecutorBalanceRakis = await rakisToken.balanceOf(swapExecutor.address);
    swapExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      swapExecutor.address
    );

    routerBalance0 = await token0.balanceOf(router.address);
    routerBalance1 = await token1.balanceOf(router.address);
    routerBalanceRakis = await rakisToken.balanceOf(router.address);
    routerBalanceEthEnd = await wallet.provider?.getBalance(router.address);

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceEth).to.equal(swapExecutorBalanceEthEnd);

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
  });

  /**** Start of swapAndAddLiquidity tests */

  /** start of section depositing both tokens, swapping A for B */

  it("#8 : should use A,B and swap A for B", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      false, // 1
      "scenario1"
    );
  });

  it("#9 : should use A,B and swap A for B and stake", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      false,
      "scenario1",
      stRakisToken
    );
  });

  it("#10 : should use A,B and swap A for B using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      true,
      "scenario1"
    );
  });

  it("#11 : should use A,B and swap A for B and stake using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      true,
      "scenario1",
      stRakisToken
    );
  });

  it("#12 : should use A and B and revert with empty msg.value", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      true,
      "scenario1",
      stRakisToken,
      ethers.BigNumber.from("0")
    );
  });

  it("#13 : should use A and B and incorrect msg.value", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("2"),
      true,
      50,
      true,
      "scenario1",
      stRakisToken,
      ethers.BigNumber.from("1")
    );
  });

  /** end of section depositing both tokens, swapping A for B */

  /** start of section depositing both tokens, swapping B for A */

  it("#14 : should use A,B and swap B for A", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("5"),
      false,
      50,
      false, // 2
      "scenario2"
    );
  });

  it("#15 : should use A,B and swap B for A and stake", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("5"),
      false,
      50,
      false,
      "scenario2",
      stRakisToken
    );
  });

  it("#16 : should use A,B and swap B for A using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("5"),
      false,
      50,
      true,
      "scenario2"
    );
  });

  it("#17 : should use A,B and swap B for A and stake using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("10"),
      ethers.BigNumber.from("5"),
      false,
      50,
      true,
      "scenario2",
      stRakisToken
    );
  });

  /** end of section depositing both tokens, swapping B for A */

  /** start of section depositing only A, swapping A for B */

  it("#18 : should use only A and swap A for B", async function () {
    // single side
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("0"),
      true,
      50,
      false,
      "scenario3"
    );
  });

  it("#19 : should use only A and swap A for B and stake", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("0"),
      true,
      50,
      false,
      "scenario3",
      stRakisToken
    );
  });

  // THE FOLLOWIING TESTS ARE NOW REDUNDANT !! (since A is not WETH, and only inputting A, no "use native ETH" option exists)
  // it("#20 : should use only A and swap A for B using native ETH", async function () {
  //   await swapAndAddTest(
  //     wallet,
  //     router,
  //     swapExecutor,
  //     swapResolver,
  //     resolver,

  //     vault,
  //     token0,
  //     token1,
  //     rakisToken,

  //     ethers.BigNumber.from("100000"),
  //     ethers.BigNumber.from("0"),
  //     true,
  //     50,
  //     true,
  //     "scenario3"
  //   );
  // });

  // it("#21 : should use only A and swap A for B and stake using nativeETH", async function () {
  //   await swapAndAddTest(
  //     wallet,
  //     router,
  //     swapExecutor,
  //     swapResolver,
  //     resolver,

  //     vault,
  //     token0,
  //     token1,
  //     rakisToken,

  //     ethers.BigNumber.from("100000"),
  //     ethers.BigNumber.from("0"),
  //     true,
  //     50,
  //     true,
  //     "scenario3",
  //     stRakisToken
  //   );
  // });

  it("#22 : should use only A and swap A for B with different msg.value and nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("100000"),
      ethers.BigNumber.from("0"),
      true,
      50,
      true,
      "scenario3",
      stRakisToken,
      ethers.BigNumber.from("100000")
    );
  });

  /** end of section depositing only A, swapping A for B */

  /** start of section depositing only B, swapping B for A */

  it("#23 : should use only B and swap B for A", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      50,
      false,
      "scenario4"
    );
  });

  it("#24 : should use only B and swap B for A and stake", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      50,
      false,
      "scenario4",
      stRakisToken
    );
  });

  it("#25 : should use only B and swap B for A using native ETH", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      50,
      true,
      "scenario4"
    );
  });

  it("#26 : should use only B and swap B for A and stake using nativeETH", async function () {
    await swapAndAddTest(
      wallet,
      router,
      swapExecutor,
      swapResolver,
      resolver,

      vault,
      token0,
      token1,
      rakisToken,

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      50,
      true,
      "scenario4",
      stRakisToken
    );
  });

  /** end of section depositing only B, swapping B for A */

  /**** end of swapAndAddLiquidity tests */
});
