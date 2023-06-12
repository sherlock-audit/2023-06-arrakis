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
import { BigNumber, Contract, Wallet } from "ethers";
import {
  getPeripheryContracts,
  deployArrakisV2,
  getFundsFromFaucet,
  createGauge,
  getArrakisResolver,
} from "../src/testEnvUtils";
import { swapAndAddTest } from "../src/swapAndAddTest";
import { ecsign } from "ethereumjs-util";
import { SignatureTransfer, MaxSigDeadline } from "@uniswap/permit2-sdk";
import { mockPayloads, OneInchDataType } from "../src/oneInchApiIntegration";

let addresses: Addresses;

const sign = (msgHash: string, privKey: string): any => {
  const hash = Buffer.alloc(32, msgHash.slice(2), "hex");
  const priv = Buffer.alloc(32, privKey.slice(2), "hex");
  return ecsign(hash, priv);
};

describe("ArrakisV2Router tests on USDC/WETH vault", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let owner: SignerWithAddress;

  let token0: ERC20;
  let token1: ERC20;
  let rakisToken: ERC20;
  let stRakisToken: ERC20;

  let resolver: Contract;
  let swapExecutor: RouterSwapExecutor;
  let router: ArrakisV2Router;
  let swapResolver: RouterSwapResolver;

  let vault: IArrakisV2;

  let gauge: IGauge;
  let swapExecutorBalanceEth: BigNumber | undefined;
  let routerBalanceEth: BigNumber | undefined;
  let randomWallet: Wallet;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet, , owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    [swapResolver, swapExecutor, router] = await getPeripheryContracts(owner);

    resolver = await getArrakisResolver(owner);

    [vault] = await deployArrakisV2(
      wallet,
      addresses.USDC,
      addresses.WETH,
      500,
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

    await getFundsFromFaucet(addresses.faucetUSDC, token0, walletAddress);
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

    randomWallet = new ethers.Wallet(
      "0x36383cc9cfbf1dc87c78c2529ae2fcd4e3fc4e575e154b357ae3a8b2739113cf",
      wallet.provider
    );

    await wallet.sendTransaction({
      to: randomWallet.address,
      value: ethers.utils.parseEther("20"),
    });
  });

  it("#0 : should deposit funds with addLiquidity", async function () {
    const amount0In = ethers.BigNumber.from("10000").mul(
      ethers.BigNumber.from("10").pow("6")
    );
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(router.address, amount0In);
    await token1.connect(wallet).approve(router.address, amount1In);

    const balance0Before = await token0.balanceOf(walletAddress);
    const balance1Before = await token1.balanceOf(walletAddress);
    const balanceArrakisV2Before = await rakisToken.balanceOf(walletAddress);

    await token0.allowance(wallet.address, router.address);
    await token1.allowance(wallet.address, router.address);

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
    const amount0In = ethers.utils.parseEther("10");
    const amount1In = ethers.BigNumber.from("10000").mul(
      ethers.BigNumber.from("10").pow("6")
    );

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

    const rewardAmount = ethers.BigNumber.from("100").mul(
      ethers.BigNumber.from("10").pow("6")
    );
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
      await wallet.getAddress(),
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
      gauge: ethers.constants.AddressZero,
    };
    await router.removeLiquidity(removeLiquidity);

    const balance0After = await token0.balanceOf(walletAddress);
    const balance1After = await token1.balanceOf(walletAddress);
    const balanceArrakisV2After = await rakisToken.balanceOf(walletAddress);

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
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
  });

  it("#4 : add and remove liquidity using native ETH", async function () {
    const token0Address = await vault.token0();
    expect(token0Address.toLowerCase()).to.equal(addresses.USDC.toLowerCase());

    const amount0In = ethers.BigNumber.from("10000").mul(
      ethers.BigNumber.from("10").pow("6")
    );
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).approve(router.address, amount0In);

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
    expect(swapExecutorBalanceEthEnd).to.equal(swapExecutorBalanceEthEnd);

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
    const token0Address = await vault.token0();
    expect(token0Address.toLowerCase()).to.equal(addresses.USDC.toLowerCase());

    const amount0In = ethers.BigNumber.from("10000").mul(
      ethers.BigNumber.from("10").pow("6")
    );
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
    expect(swapExecutorBalanceEth).to.equal(swapExecutorBalanceEthEnd);

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
    const token0Address = await vault.token0();
    expect(token0Address.toLowerCase()).to.equal(addresses.USDC.toLowerCase());

    const amount1In = ethers.utils.parseEther("10");
    const amount0In = ethers.BigNumber.from("10000").mul(
      ethers.BigNumber.from("10").pow("6")
    );

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
    const token0Address = await vault.token0();
    expect(token0Address.toLowerCase()).to.equal(addresses.USDC.toLowerCase());

    const amount0In = ethers.BigNumber.from("10000").mul(
      ethers.BigNumber.from("10").pow("6")
    );
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
      5,
      false,
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
      5,
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
      5,
      true, // 2
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
      5,
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
      5,
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
      5,
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
      5,
      false,
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
      5,
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
      5,
      true, // 2
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
      5,
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

      ethers.BigNumber.from("1000"),
      ethers.BigNumber.from("0"),
      true,
      5,
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

      ethers.BigNumber.from("1000"),
      ethers.BigNumber.from("0"),
      true,
      5,
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

  //     ethers.BigNumber.from("1000"),
  //     ethers.BigNumber.from("0"),
  //     true,
  //     5,
  //     true,
  //     "scenario3"
  //   );
  // });

  // it("#21: should use only A and swap A for B and stake", async function () {
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

  //     ethers.BigNumber.from("1000"),
  //     ethers.BigNumber.from("0"),
  //     true,
  //     5,
  //     true,
  //     "scenario3",
  //     stRakisToken
  //   );
  // });

  it("#22; should use only A and swap A for B with different msg.value and nativeETH", async function () {
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

      ethers.BigNumber.from("1000"),
      ethers.BigNumber.from("0"),
      true,
      5,
      true,
      "scenario3",
      stRakisToken,
      ethers.BigNumber.from("100000")
    );
  });

  /** end of section depositing only A, swapping A for B */

  /** start of section depositing only B, swapping B for A */

  it("#23 : should use only B and swap B for A", async function () {
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

      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("5"),
      false,
      5,
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
      5,
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
      5,
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
      5,
      true,
      "scenario4",
      stRakisToken
    );
  });

  /** end of section depositing only B, swapping B for A */

  /**** end of swapAndAddLiquidity tests */
  it("#27 : should deposit funds with addLiquidityPermit2", async function () {
    const amount0In = ethers.BigNumber.from("10000").mul(
      ethers.BigNumber.from("10").pow("6")
    );
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).transfer(randomWallet.address, amount0In);
    await token1.connect(wallet).transfer(randomWallet.address, amount1In);

    await token0.connect(randomWallet).approve(router.address, 0);
    await token1.connect(randomWallet).approve(router.address, 0);

    await token0
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);
    await token1
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);

    const balance0Before = await token0.balanceOf(randomWallet.address);
    const balance1Before = await token1.balanceOf(randomWallet.address);
    const balanceArrakisV2Before = await rakisToken.balanceOf(
      randomWallet.address
    );

    const hashed = SignatureTransfer.hash(
      {
        permitted: [
          {
            token: token0.address,
            amount: amount0In,
          },
          {
            token: token1.address,
            amount: amount1In,
          },
        ],
        spender: router.address,
        nonce: "100",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      addresses.Permit2,
      network.config.chainId ? network.config.chainId : 1
    );

    const sig = sign(
      hashed,
      "0x36383cc9cfbf1dc87c78c2529ae2fcd4e3fc4e575e154b357ae3a8b2739113cf"
    );

    const encodedSig = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32"],
      ["0x" + sig.r.toString("hex"), "0x" + sig.s.toString("hex")]
    );

    const finalSig = encodedSig + sig.v.toString(16);

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: randomWallet.address,
      gauge: ethers.constants.AddressZero,
    };

    const addLiquidityPermit2Data = {
      addData: addLiquidityData,
      permit: {
        permitted: [
          {
            token: token0.address,
            amount: amount0In,
          },
          {
            token: token1.address,
            amount: amount1In,
          },
        ],
        nonce: "100",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      signature: finalSig,
    };

    await router
      .connect(randomWallet)
      .addLiquidityPermit2(addLiquidityPermit2Data);

    const balance0After = await token0.balanceOf(randomWallet.address);
    const balance1After = await token1.balanceOf(randomWallet.address);
    const balanceArrakisV2After = await rakisToken.balanceOf(
      randomWallet.address
    );

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

  it("#28 : should deposit funds and stake", async function () {
    const amount0In = ethers.BigNumber.from("100").mul(
      ethers.BigNumber.from("10").pow("6")
    );
    const amount1In = ethers.utils.parseEther("1");
    await token0.connect(wallet).transfer(randomWallet.address, amount0In);
    await token1.connect(wallet).transfer(randomWallet.address, amount1In);
    await token0.connect(randomWallet).approve(router.address, 0);
    await token1.connect(randomWallet).approve(router.address, 0);

    await token0
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);
    await token1
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);

    const balance0Before = await token0.balanceOf(randomWallet.address);
    const balance1Before = await token1.balanceOf(randomWallet.address);
    const balanceArrakisV2Before = await rakisToken.balanceOf(
      randomWallet.address
    );
    const balanceStakedBefore = await stRakisToken.balanceOf(
      randomWallet.address
    );

    const hashed = SignatureTransfer.hash(
      {
        permitted: [
          {
            token: token0.address,
            amount: amount0In,
          },
          {
            token: token1.address,
            amount: amount1In,
          },
        ],
        spender: router.address,
        nonce: "101",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      addresses.Permit2,
      network.config.chainId ? network.config.chainId : 1
    );

    const sig = sign(
      hashed,
      "0x36383cc9cfbf1dc87c78c2529ae2fcd4e3fc4e575e154b357ae3a8b2739113cf"
    );

    const encodedSig = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32"],
      ["0x" + sig.r.toString("hex"), "0x" + sig.s.toString("hex")]
    );

    const finalSig = encodedSig + sig.v.toString(16);

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: randomWallet.address,
      gauge: gauge.address,
    };

    const addLiquidityPermit2Data = {
      addData: addLiquidityData,
      permit: {
        permitted: [
          {
            token: token0.address,
            amount: amount0In,
          },
          {
            token: token1.address,
            amount: amount1In,
          },
        ],
        nonce: "101",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      signature: finalSig,
    };

    await router
      .connect(randomWallet)
      .addLiquidityPermit2(addLiquidityPermit2Data);

    const balance0After = await token0.balanceOf(randomWallet.address);
    const balance1After = await token1.balanceOf(randomWallet.address);
    const balanceStakedAfter = await stRakisToken.balanceOf(
      randomWallet.address
    );
    const balanceArrakisV2After = await rakisToken.balanceOf(
      randomWallet.address
    );

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
      randomWallet.address,
      token0.address
    );
    expect(claimable).to.be.gt(0);
  });

  it("#29 : should withdraw funds with removeLiquidityPermit2", async function () {
    const balanceArrakisV2Before = await rakisToken.balanceOf(
      randomWallet.address
    );
    expect(balanceArrakisV2Before).to.be.gt(ethers.constants.Zero);

    const balance0Before = await token0.balanceOf(randomWallet.address);
    const balance1Before = await token1.balanceOf(randomWallet.address);

    await rakisToken.connect(randomWallet).approve(router.address, 0);
    await rakisToken
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);

    const hashed = SignatureTransfer.hash(
      {
        permitted: {
          token: rakisToken.address,
          amount: balanceArrakisV2Before.div(2),
        },
        spender: router.address,
        nonce: "102",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      addresses.Permit2,
      network.config.chainId ? network.config.chainId : 1
    );

    const sig = sign(
      hashed,
      "0x36383cc9cfbf1dc87c78c2529ae2fcd4e3fc4e575e154b357ae3a8b2739113cf"
    );

    const encodedSig = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32"],
      ["0x" + sig.r.toString("hex"), "0x" + sig.s.toString("hex")]
    );

    const finalSig = encodedSig + sig.v.toString(16);

    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceArrakisV2Before.div(2),
      amount0Min: 0,
      amount1Min: 0,
      receiver: randomWallet.address,
      receiveETH: false,
      gauge: ethers.constants.AddressZero,
    };

    const removeLiquidityPermit2Data = {
      removeData: removeLiquidity,
      permit: {
        permitted: {
          token: rakisToken.address,
          amount: balanceArrakisV2Before.div(2),
        },
        nonce: "102",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      signature: finalSig,
    };
    await router
      .connect(randomWallet)
      .removeLiquidityPermit2(removeLiquidityPermit2Data);

    const balance0After = await token0.balanceOf(randomWallet.address);
    const balance1After = await token1.balanceOf(randomWallet.address);
    const balanceArrakisV2After = await rakisToken.balanceOf(
      randomWallet.address
    );

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceArrakisV2Before).to.be.gt(balanceArrakisV2After);
  });

  it("#30 : should unstake and withdraw funds with removeLiquidityPermit2", async function () {
    const balanceStakedBefore = await stRakisToken.balanceOf(
      randomWallet.address
    );
    expect(balanceStakedBefore).to.be.gt(ethers.constants.Zero);

    const balance0Before = await token0.balanceOf(randomWallet.address);
    const balance1Before = await token1.balanceOf(randomWallet.address);

    await stRakisToken.connect(randomWallet).approve(router.address, 0);
    await stRakisToken
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);

    const hashed = SignatureTransfer.hash(
      {
        permitted: {
          token: stRakisToken.address,
          amount: balanceStakedBefore,
        },
        spender: router.address,
        nonce: "103",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      addresses.Permit2,
      network.config.chainId ? network.config.chainId : 1
    );

    const sig = sign(
      hashed,
      "0x36383cc9cfbf1dc87c78c2529ae2fcd4e3fc4e575e154b357ae3a8b2739113cf"
    );

    const encodedSig = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32"],
      ["0x" + sig.r.toString("hex"), "0x" + sig.s.toString("hex")]
    );

    const finalSig = encodedSig + sig.v.toString(16);

    const removeLiquidity = {
      vault: vault.address,
      burnAmount: balanceStakedBefore,
      amount0Min: 0,
      amount1Min: 0,
      receiver: randomWallet.address,
      receiveETH: false,
      gauge: gauge.address,
    };
    const removeLiquidityPermit2Data = {
      removeData: removeLiquidity,
      permit: {
        permitted: {
          token: stRakisToken.address,
          amount: balanceStakedBefore,
        },
        nonce: "103",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      signature: finalSig,
    };

    await router
      .connect(randomWallet)
      .removeLiquidityPermit2(removeLiquidityPermit2Data);

    const balance0After = await token0.balanceOf(randomWallet.address);
    const balance1After = await token1.balanceOf(randomWallet.address);
    const balanceStakedAfter = await stRakisToken.balanceOf(
      randomWallet.address
    );

    expect(balance0After).to.be.gt(balance0Before);
    expect(balance1After).to.be.gt(balance1Before);
    expect(balanceStakedBefore).to.be.gt(balanceStakedAfter);
    expect(balanceStakedAfter).to.eq(0);
  });

  it("#31 : addLiquidityPermit2 using native ETH", async function () {
    const token0Address = await vault.token0();
    expect(token0Address.toLowerCase()).to.equal(addresses.USDC.toLowerCase());

    const amount0In = ethers.BigNumber.from("1000").mul(
      ethers.BigNumber.from("10").pow("6")
    );
    const amount1In = ethers.utils.parseEther("1");

    await token0.connect(wallet).transfer(randomWallet.address, amount0In);

    await token0.connect(randomWallet).approve(router.address, 0);
    await token0
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);

    const balance0Before = await token0.balanceOf(randomWallet.address);
    const balance1Before = await wallet.provider?.getBalance(
      randomWallet.address
    );
    const balanceArrakisV2Before = await rakisToken.balanceOf(
      randomWallet.address
    );

    const hashed = SignatureTransfer.hash(
      {
        permitted: {
          token: token0.address,
          amount: amount0In,
        },
        spender: router.address,
        nonce: "700",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      addresses.Permit2,
      network.config.chainId ? network.config.chainId : 1
    );

    const sig = sign(
      hashed,
      "0x36383cc9cfbf1dc87c78c2529ae2fcd4e3fc4e575e154b357ae3a8b2739113cf"
    );

    const encodedSig = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32"],
      ["0x" + sig.r.toString("hex"), "0x" + sig.s.toString("hex")]
    );

    const finalSig = encodedSig + sig.v.toString(16);

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: randomWallet.address,
      gauge: ethers.constants.AddressZero,
    };

    const addLiquidityPermit2Data = {
      addData: addLiquidityData,
      permit: {
        permitted: [
          {
            token: token0.address,
            amount: amount0In,
          },
        ],
        nonce: "700",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      signature: finalSig,
    };

    await router
      .connect(randomWallet)
      .addLiquidityPermit2(addLiquidityPermit2Data, {
        value: amount1In,
      });

    const balance0After = await token0.balanceOf(randomWallet.address);
    const balance1After = await wallet.provider?.getBalance(
      randomWallet.address
    );
    const balanceArrakisV2After = await rakisToken.balanceOf(
      randomWallet.address
    );

    expect(balance0Before).to.be.gt(balance0After);
    expect(balance1Before).to.be.gt(balance1After);
    expect(balanceArrakisV2Before).to.be.lt(balanceArrakisV2After);

    const swapExecutorBalance0 = await token0.balanceOf(swapExecutor.address);
    const swapExecutorBalance1 = await token1.balanceOf(swapExecutor.address);
    const swapExecutorBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );
    const swapExecutorBalanceEthEnd = await wallet.provider?.getBalance(
      swapExecutor.address
    );

    expect(swapExecutorBalance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalance1).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceRakis).to.equal(ethers.constants.Zero);
    expect(swapExecutorBalanceEth).to.equal(swapExecutorBalanceEthEnd);

    const routerBalance0 = await token0.balanceOf(router.address);
    const routerBalance1 = await token1.balanceOf(router.address);
    const routerBalanceRakis = await rakisToken.balanceOf(router.address);
    const routerBalanceEthEnd = await wallet.provider?.getBalance(
      router.address
    );

    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    expect(routerBalanceEth).to.equal(routerBalanceEthEnd);
  });
  it("#32: adds liquidity with swapAndAddLiquidityPermit2", async function () {
    // formatting amounts
    const decimalsToken0 = await token0.decimals();
    const decimalsToken1 = await token1.decimals();
    const amount0Max = ethers.utils.parseUnits("10", decimalsToken0);
    const amount1Max = ethers.utils.parseUnits("5", decimalsToken1);

    // amounts used for getMintAmounts(), to be filled later depending on swap amounts
    let amount0Use: BigNumber;
    let amount1Use: BigNumber;

    // PERMIT 2 STUFF GET RELEVANT APPROVALS FOR randomWallet
    await token0.connect(wallet).transfer(randomWallet.address, amount0Max);
    await token1.connect(wallet).transfer(randomWallet.address, amount1Max);

    await token0.connect(randomWallet).approve(router.address, 0);
    await token1.connect(randomWallet).approve(router.address, 0);
    await token0
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);
    await token1
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);

    const hashed = SignatureTransfer.hash(
      {
        permitted: [
          {
            token: token0.address,
            amount: amount0Max,
          },
          {
            token: token1.address,
            amount: amount1Max,
          },
        ],
        spender: router.address,
        nonce: "1011",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      addresses.Permit2,
      network.config.chainId ? network.config.chainId : 1
    );

    const sig = sign(
      hashed,
      "0x36383cc9cfbf1dc87c78c2529ae2fcd4e3fc4e575e154b357ae3a8b2739113cf"
    );

    const encodedSig = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32"],
      ["0x" + sig.r.toString("hex"), "0x" + sig.s.toString("hex")]
    );

    const finalSig = encodedSig + sig.v.toString(16);

    // get before balances
    const balanceStRakisBefore = stRakisToken
      ? await stRakisToken.balanceOf(randomWallet.address)
      : ethers.BigNumber.from(0);

    // we store working payloads from 1inch API for the swaps needed for tests and block number tests are pinned to
    let swapParams: OneInchDataType;
    let swapAmountIn: BigNumber;
    let swapAmountOut: BigNumber;

    const vaultName = (await token0.symbol()) + "/" + (await token1.symbol());
    const mockPayloadScenario = "scenario2";
    if (
      mockPayloads[vaultName] &&
      mockPayloads[vaultName][mockPayloadScenario]
    ) {
      // console.log("using mock payload...");
      swapParams = {
        to: addresses.OneInchRouter,
        data: mockPayloads[vaultName][mockPayloadScenario].payload,
      };
      swapAmountIn = ethers.BigNumber.from(
        mockPayloads[vaultName][mockPayloadScenario].swapIn
      );
      swapAmountOut = ethers.BigNumber.from(
        mockPayloads[vaultName][mockPayloadScenario].swapOut
      );
    } else {
      return Promise.reject(
        "Mock payload of 1inch api not found for this scenario!"
      );
    }

    // calculate minimum amount out on the swap considering slippage passed
    const amountOut = swapAmountOut
      .mul(ethers.BigNumber.from((100 - 50).toString()))
      .div(ethers.BigNumber.from((100).toString()));

    // preparing parameter structs for swapAndAddLiquidity()

    const addData = {
      amount0Max: amount0Max,
      amount1Max: amount1Max,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: randomWallet.address,
      gauge: stRakisToken.address,
    };

    const swapData = {
      amountInSwap: swapAmountIn.toString(),
      amountOutSwap: amountOut,
      zeroForOne: false,
      swapRouter: swapParams.to,
      swapPayload: swapParams.data,
    };
    const swapAndAddData = {
      addData: addData,
      swapData: swapData,
    };

    const swapAndAddPermit2Data = {
      swapAndAddData: swapAndAddData,
      permit: {
        permitted: [
          {
            token: token0.address,
            amount: amount0Max,
          },
          {
            token: token1.address,
            amount: amount1Max,
          },
        ],
        nonce: "1011",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      signature: finalSig,
    };

    let hasSwapped = false; // flag indicating if "Swapped" event fired
    let hasMinted = false; // flag indicating if "Minted" event fired

    // object to be filled with "Swapped" event data
    const swapppedEventData = {
      zeroForOne: false,
      amount0Diff: ethers.BigNumber.from(0),
      amount1Diff: ethers.BigNumber.from(0),
      amountOutSwap: ethers.BigNumber.from(0),
    };

    // object to be filled with "Minted" event data
    const mintedEventData = {
      receiver: "",
      mintAmount: ethers.BigNumber.from(0),
      amount0In: ethers.BigNumber.from(0),
      amount1In: ethers.BigNumber.from(0),
      liquidityMinted: ethers.BigNumber.from(0),
    };

    // listener for getting data from "Swapped" event
    router.on(
      "Swapped",
      (
        zeroForOne: boolean,
        amount0Diff: BigNumber,
        amount1Diff: BigNumber,
        amountOutSwap: BigNumber
      ) => {
        swapppedEventData.zeroForOne = zeroForOne;
        swapppedEventData.amount0Diff = amount0Diff;
        swapppedEventData.amount1Diff = amount1Diff;
        swapppedEventData.amountOutSwap = amountOutSwap;
        hasSwapped = true;
      }
    );

    // listener for getting data from "Minted" event
    vault.on(
      "LogMint",
      (
        receiver: string,
        mintAmount: BigNumber,
        amount0In: BigNumber,
        amount1In: BigNumber
      ) => {
        mintedEventData.receiver = receiver;
        mintedEventData.mintAmount = ethers.BigNumber.from(mintAmount);
        mintedEventData.amount0In = ethers.BigNumber.from(amount0In);
        mintedEventData.amount1In = ethers.BigNumber.from(amount1In);
        hasMinted = true;
      }
    );

    // function that returns a promise that resolves when "Swapped" and "Minted" are fired
    const getEventsData = async () => {
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (hasSwapped && hasMinted) {
            clearInterval(interval);
            resolve();
          }
        }, 5000);
      });
    };
    const balance0Before = await token0.balanceOf(randomWallet.address);
    const balance1Before = await token1.balanceOf(randomWallet.address);

    // call swapAndAddLiquidity
    const swapAndAddTxPending = await router
      .connect(randomWallet)
      .swapAndAddLiquidityPermit2(swapAndAddPermit2Data);

    // wait for tx
    await swapAndAddTxPending.wait();

    // wait for events to be fired so we have swap and deposit data
    await getEventsData();

    // get new balances
    const balance0After = await token0.balanceOf(randomWallet.address);
    const balance1After = await token1.balanceOf(randomWallet.address);
    const balanceStRakisAfter = stRakisToken
      ? await stRakisToken.balanceOf(randomWallet.address)
      : ethers.BigNumber.from(0);

    // calculate actual amounts used for mintAmounts after swap and validate swapAmountOut
    if (swapppedEventData.zeroForOne) {
      amount0Use = swapAndAddData.addData.amount0Max.sub(
        swapppedEventData.amount0Diff
      );
      amount1Use = swapAndAddData.addData.amount1Max.add(
        swapppedEventData.amount1Diff
      );

      expect(amountOut).to.be.lt(swapppedEventData.amount1Diff);
    } else {
      amount0Use = swapAndAddData.addData.amount0Max.add(
        swapppedEventData.amount0Diff
      );
      amount1Use = swapAndAddData.addData.amount1Max.sub(
        swapppedEventData.amount1Diff
      );

      expect(amountOut).to.be.lt(swapppedEventData.amount0Diff);
    }

    // calculate expected refunds
    const refund0 = amount0Use.sub(mintedEventData.amount0In);
    const refund1 = amount1Use.sub(mintedEventData.amount1In);

    // validate balances
    expect(balance0After).to.equal(
      balance0Before.sub(swapAndAddData.addData.amount0Max).add(refund0)
    );
    expect(balance1After).to.equal(
      balance1Before.sub(swapAndAddData.addData.amount1Max).add(refund1)
    );
    expect(balanceStRakisBefore).to.be.lt(balanceStRakisAfter);

    // validate router balances
    const swapperBalance0 = await token0.balanceOf(swapExecutor.address);
    const swapperBalance1 = await token1.balanceOf(swapExecutor.address);
    const swapperBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );
    expect(swapperBalance0).to.equal(ethers.constants.Zero);
    expect(swapperBalance1).to.equal(ethers.constants.Zero);
    expect(swapperBalanceRakis).to.equal(ethers.constants.Zero);
    if (stRakisToken) {
      const routerBalanceStRakis = await stRakisToken.balanceOf(
        swapExecutor.address
      );
      expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
    }

    // validate router - 1inch allowance
    const swapExecutorAllowance0 = await token0.allowance(
      swapExecutor.address,
      addresses.OneInchRouter
    );
    const swapExecutorAllowance1 = await token1.allowance(
      swapExecutor.address,
      addresses.OneInchRouter
    );
    expect(swapExecutorAllowance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorAllowance1).to.equal(ethers.constants.Zero);

    // validate generic router balances
    const routerBalance0 = await token0.balanceOf(router.address);
    const routerBalance1 = await token1.balanceOf(router.address);
    const routerBalanceRakis = await rakisToken.balanceOf(router.address);
    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    if (stRakisToken) {
      const routerBalanceStRakis = await stRakisToken.balanceOf(router.address);
      expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
    }
    const routerBalETH = await wallet.provider?.getBalance(router.address);
    expect(routerBalETH).to.equal(ethers.constants.Zero);

    // validate we cannot mint with amounts refunded
    await expect(
      resolver.getMintAmounts(vault.address, refund0, refund1)
    ).to.be.revertedWith("ArrakisVaultV2: mint 0");
  });

  it("#33: adds liquidity with swapAndAddLiquidityPermit2", async function () {
    // formatting amounts
    const decimalsToken0 = await token0.decimals();
    const decimalsToken1 = await token1.decimals();
    const amount0Max = ethers.utils.parseUnits("10", decimalsToken0);
    const amount1Max = ethers.utils.parseUnits("5", decimalsToken1);

    // amounts used for getMintAmounts(), to be filled later depending on swap amounts
    let amount0Use: BigNumber;
    let amount1Use: BigNumber;

    // PERMIT 2 STUFF GET RELEVANT APPROVALS FOR randomWallet
    await token0.connect(wallet).transfer(randomWallet.address, amount0Max);

    await token0.connect(randomWallet).approve(router.address, 0);

    await token0
      .connect(randomWallet)
      .approve(addresses.Permit2, ethers.constants.MaxUint256);

    const hashed = SignatureTransfer.hash(
      {
        permitted: {
          token: token0.address,
          amount: amount0Max,
        },
        spender: router.address,
        nonce: "1012",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      addresses.Permit2,
      network.config.chainId ? network.config.chainId : 1
    );

    const sig = sign(
      hashed,
      "0x36383cc9cfbf1dc87c78c2529ae2fcd4e3fc4e575e154b357ae3a8b2739113cf"
    );

    const encodedSig = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32"],
      ["0x" + sig.r.toString("hex"), "0x" + sig.s.toString("hex")]
    );

    const finalSig = encodedSig + sig.v.toString(16);

    // get before balances
    const balanceStRakisBefore = stRakisToken
      ? await stRakisToken.balanceOf(randomWallet.address)
      : ethers.BigNumber.from(0);

    // we store working payloads from 1inch API for the swaps needed for tests and block number tests are pinned to
    let swapParams: OneInchDataType;
    let swapAmountIn: BigNumber;
    let swapAmountOut: BigNumber;

    const vaultName = (await token0.symbol()) + "/" + (await token1.symbol());
    const mockPayloadScenario = "scenario2";
    if (
      mockPayloads[vaultName] &&
      mockPayloads[vaultName][mockPayloadScenario]
    ) {
      // console.log("using mock payload...");
      swapParams = {
        to: addresses.OneInchRouter,
        data: mockPayloads[vaultName][mockPayloadScenario].payload,
      };
      swapAmountIn = ethers.BigNumber.from(
        mockPayloads[vaultName][mockPayloadScenario].swapIn
      );
      swapAmountOut = ethers.BigNumber.from(
        mockPayloads[vaultName][mockPayloadScenario].swapOut
      );
    } else {
      return Promise.reject(
        "Mock payload of 1inch api not found for this scenario!"
      );
    }

    // calculate minimum amount out on the swap considering slippage passed
    const amountOut = swapAmountOut
      .mul(ethers.BigNumber.from((100 - 50).toString()))
      .div(ethers.BigNumber.from((100).toString()));

    // preparing parameter structs for swapAndAddLiquidity()

    const addData = {
      amount0Max: amount0Max,
      amount1Max: amount1Max,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: randomWallet.address,
      gauge: stRakisToken.address,
    };
    const swapData = {
      amountInSwap: swapAmountIn.toString(),
      amountOutSwap: amountOut,
      zeroForOne: false,
      swapRouter: swapParams.to,
      swapPayload: swapParams.data,
    };
    const swapAndAddData = {
      addData: addData,
      swapData: swapData,
    };

    const swapAndAddPermit2Data = {
      swapAndAddData: swapAndAddData,
      permit: {
        permitted: [
          {
            token: token0.address,
            amount: amount0Max,
          },
        ],
        nonce: "1012",
        deadline: MaxSigDeadline.sub(1).toString(),
      },
      signature: finalSig,
    };

    let hasSwapped = false; // flag indicating if "Swapped" event fired
    let hasMinted = false; // flag indicating if "Minted" event fired

    // object to be filled with "Swapped" event data
    const swapppedEventData = {
      zeroForOne: false,
      amount0Diff: ethers.BigNumber.from(0),
      amount1Diff: ethers.BigNumber.from(0),
      amountOutSwap: ethers.BigNumber.from(0),
    };

    // object to be filled with "Minted" event data
    const mintedEventData = {
      receiver: "",
      mintAmount: ethers.BigNumber.from(0),
      amount0In: ethers.BigNumber.from(0),
      amount1In: ethers.BigNumber.from(0),
      liquidityMinted: ethers.BigNumber.from(0),
    };

    // listener for getting data from "Swapped" event
    router.on(
      "Swapped",
      (
        zeroForOne: boolean,
        amount0Diff: BigNumber,
        amount1Diff: BigNumber,
        amountOutSwap: BigNumber
      ) => {
        swapppedEventData.zeroForOne = zeroForOne;
        swapppedEventData.amount0Diff = amount0Diff;
        swapppedEventData.amount1Diff = amount1Diff;
        swapppedEventData.amountOutSwap = amountOutSwap;
        hasSwapped = true;
      }
    );

    // listener for getting data from "Minted" event
    vault.on(
      "LogMint",
      (
        receiver: string,
        mintAmount: BigNumber,
        amount0In: BigNumber,
        amount1In: BigNumber
      ) => {
        mintedEventData.receiver = receiver;
        mintedEventData.mintAmount = ethers.BigNumber.from(mintAmount);
        mintedEventData.amount0In = ethers.BigNumber.from(amount0In);
        mintedEventData.amount1In = ethers.BigNumber.from(amount1In);
        hasMinted = true;
      }
    );

    // function that returns a promise that resolves when "Swapped" and "Minted" are fired
    const getEventsData = async () => {
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (hasSwapped && hasMinted) {
            clearInterval(interval);
            resolve();
          }
        }, 5000);
      });
    };
    const balance0Before = await token0.balanceOf(randomWallet.address);
    const balance1Before = await wallet.provider?.getBalance(
      randomWallet.address
    );

    // call swapAndAddLiquidity
    const swapAndAddTxPending = await router
      .connect(randomWallet)
      .swapAndAddLiquidityPermit2(swapAndAddPermit2Data, { value: amount1Max });

    // wait for tx
    const swapAndAddTx = await swapAndAddTxPending.wait();

    const ethSpentForGas = swapAndAddTx.gasUsed.mul(
      swapAndAddTx.effectiveGasPrice
    );

    // wait for events to be fired so we have swap and deposit data
    await getEventsData();

    // get new balances
    const balance0After = await token0.balanceOf(randomWallet.address);
    const balance1After = await wallet.provider?.getBalance(
      randomWallet.address
    );
    const balanceStRakisAfter = stRakisToken
      ? await stRakisToken.balanceOf(randomWallet.address)
      : ethers.BigNumber.from(0);

    // calculate actual amounts used for mintAmounts after swap and validate swapAmountOut
    if (swapppedEventData.zeroForOne) {
      amount0Use = swapAndAddData.addData.amount0Max.sub(
        swapppedEventData.amount0Diff
      );
      amount1Use = swapAndAddData.addData.amount1Max.add(
        swapppedEventData.amount1Diff
      );

      expect(amountOut).to.be.lt(swapppedEventData.amount1Diff);
    } else {
      amount0Use = swapAndAddData.addData.amount0Max.add(
        swapppedEventData.amount0Diff
      );
      amount1Use = swapAndAddData.addData.amount1Max.sub(
        swapppedEventData.amount1Diff
      );

      expect(amountOut).to.be.lt(swapppedEventData.amount0Diff);
    }

    // calculate expected refunds
    const refund0 = amount0Use.sub(mintedEventData.amount0In);
    const refund1 = amount1Use.sub(mintedEventData.amount1In);

    // validate balances
    expect(balance0After).to.equal(
      balance0Before.sub(swapAndAddData.addData.amount0Max).add(refund0)
    );
    expect(balance1After).to.be.lt(
      balance1Before
        ?.sub(swapAndAddData.addData.amount1Max)
        .add(refund1)
        .add(ethSpentForGas)
    );
    expect(balance1After);
    expect(balanceStRakisBefore).to.be.lt(balanceStRakisAfter);

    // validate router balances
    const swapperBalance0 = await token0.balanceOf(swapExecutor.address);
    const swapperBalance1 = await token1.balanceOf(swapExecutor.address);
    const swapperBalanceRakis = await rakisToken.balanceOf(
      swapExecutor.address
    );
    expect(swapperBalance0).to.equal(ethers.constants.Zero);
    expect(swapperBalance1).to.equal(ethers.constants.Zero);
    expect(swapperBalanceRakis).to.equal(ethers.constants.Zero);
    if (stRakisToken) {
      const routerBalanceStRakis = await stRakisToken.balanceOf(
        swapExecutor.address
      );
      expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
    }

    // validate router - 1inch allowance
    const swapExecutorAllowance0 = await token0.allowance(
      swapExecutor.address,
      addresses.OneInchRouter
    );
    const swapExecutorAllowance1 = await token1.allowance(
      swapExecutor.address,
      addresses.OneInchRouter
    );
    expect(swapExecutorAllowance0).to.equal(ethers.constants.Zero);
    expect(swapExecutorAllowance1).to.equal(ethers.constants.Zero);

    // validate generic router balances
    const routerBalance0 = await token0.balanceOf(router.address);
    const routerBalance1 = await token1.balanceOf(router.address);
    const routerBalanceRakis = await rakisToken.balanceOf(router.address);
    expect(routerBalance0).to.equal(ethers.constants.Zero);
    expect(routerBalance1).to.equal(ethers.constants.Zero);
    expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
    if (stRakisToken) {
      const routerBalanceStRakis = await stRakisToken.balanceOf(router.address);
      expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
    }
    const routerBalETH = await wallet.provider?.getBalance(router.address);
    expect(routerBalETH).to.equal(ethers.constants.Zero);

    // validate we cannot mint with amounts refunded
    await expect(
      resolver.getMintAmounts(vault.address, refund0, refund1)
    ).to.be.revertedWith("ArrakisVaultV2: mint 0");
  });
  it("#33: adds liquidity with mint restrictions", async function () {
    // formatting amounts
    const decimalsToken0 = await token0.decimals();
    const decimalsToken1 = await token1.decimals();
    const amount0Max = ethers.utils.parseUnits("10", decimalsToken0);
    const amount1Max = ethers.utils.parseUnits("5", decimalsToken1);

    await token0.connect(wallet).approve(router.address, amount0Max);
    await token1.connect(wallet).approve(router.address, amount1Max);

    await vault.connect(wallet).setRestrictedMint(router.address);

    const currentSupply = await vault.totalSupply();

    await router
      .connect(owner)
      .setMintRules(
        vault.address,
        ethers.utils.parseEther("0.01").add(currentSupply),
        true
      );

    const { mintAmount } = await resolver.getMintAmounts(
      vault.address,
      amount0Max,
      amount1Max
    );
    expect(mintAmount).to.be.lte(ethers.utils.parseEther("0.01"));
    const addLiquidityData = {
      amount0Max: amount0Max,
      amount1Max: amount1Max,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: walletAddress,
      gauge: ethers.constants.AddressZero,
    };

    await expect(
      router.connect(wallet).addLiquidity(addLiquidityData)
    ).to.be.revertedWith("not whitelisted");

    await router.connect(owner).whitelist(vault.address, [wallet.address]);

    await router.connect(wallet).addLiquidity(addLiquidityData);

    await token0.connect(wallet).approve(router.address, amount0Max);
    await token1.connect(wallet).approve(router.address, amount1Max);

    await router
      .connect(owner)
      .setMintRules(vault.address, currentSupply, true);

    await expect(
      router.connect(wallet).addLiquidity(addLiquidityData)
    ).to.be.revertedWith("above supply cap");

    await router
      .connect(owner)
      .setMintRules(
        vault.address,
        ethers.utils.parseEther("1").add(currentSupply),
        false
      );

    await token0.connect(wallet).transfer(randomWallet.address, amount0Max);
    await token1.connect(wallet).transfer(randomWallet.address, amount1Max);

    await token0.connect(randomWallet).approve(router.address, amount0Max);
    await token1.connect(randomWallet).approve(router.address, amount1Max);

    await router.connect(randomWallet).addLiquidity(addLiquidityData);
  });
});
