import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  ArrakisV2GaugeBeacon,
  ArrakisV2GaugeFactory,
  ArrakisV2Router,
  ArrakisV2StaticDeployer,
  ERC20,
  IArrakisV2,
  IArrakisV2Factory,
  IGauge,
  IUniswapV3Pool,
  IUniswapV3Factory,
  SwapMock,
  ArrakisV2StaticManager,
  IArrakisV2Resolver,
  IArrakisV2Helper,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import { BigNumber } from "ethers";
import {
  getFundsFromFaucet,
  getArrakisResolver,
  getPeripheryContracts,
} from "../src/testEnvUtils";
import Gauge from "../src/LiquidityGaugeV4.json";

let addresses: Addresses;

describe("ArrakisV2 Periphery integration test", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let admin: SignerWithAddress;
  let owner: SignerWithAddress;

  let token0: ERC20;
  let token1: ERC20;
  let rewardToken: ERC20;

  let resolver: IArrakisV2Resolver;

  let vault: IArrakisV2;
  let pool05: IUniswapV3Pool;
  let pool3: IUniswapV3Pool;

  let uniFactory: IUniswapV3Factory;

  let gaugeFactory: ArrakisV2GaugeFactory;
  let gaugeBeacon: ArrakisV2GaugeBeacon;

  let arrakisFactory: IArrakisV2Factory;

  let staticDeployer: ArrakisV2StaticDeployer;

  let router: ArrakisV2Router;

  let gauge: IGauge;

  let swapper: SwapMock;

  let manager: ArrakisV2StaticManager;

  let helper: IArrakisV2Helper;

  before(async function () {
    await deployments.fixture();
    addresses = getAddresses(network.name);
    [wallet, admin, owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    resolver = (await getArrakisResolver(owner)) as IArrakisV2Resolver;

    [, , router] = await getPeripheryContracts(owner);

    uniFactory = (await ethers.getContractAt(
      "IUniswapV3Factory",
      addresses.UniswapV3Factory
    )) as IUniswapV3Factory;

    pool05 = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniFactory.getPool(addresses.DAI, addresses.WETH, 500)
    )) as IUniswapV3Pool;

    pool3 = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniFactory.getPool(addresses.DAI, addresses.WETH, 3000)
    )) as IUniswapV3Pool;

    token0 = (await ethers.getContractAt(
      "ERC20",
      await pool05.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await pool05.token1()
    )) as ERC20;

    gaugeFactory = (await ethers.getContractAt(
      "ArrakisV2GaugeFactory",
      (
        await deployments.get("ArrakisV2GaugeFactory")
      ).address
    )) as ArrakisV2GaugeFactory;

    gaugeBeacon = (await ethers.getContractAt(
      "ArrakisV2GaugeBeacon",
      (
        await deployments.get("ArrakisV2GaugeBeacon")
      ).address
    )) as ArrakisV2GaugeBeacon;

    const gaugeImplFactory = ethers.ContractFactory.fromSolidity(Gauge, wallet);

    const gaugeImpl = await gaugeImplFactory.deploy({
      gasLimit: 6000000,
    });

    await gaugeBeacon.connect(wallet).upgradeTo(gaugeImpl.address);

    staticDeployer = (await ethers.getContractAt(
      "ArrakisV2StaticDeployer",
      (
        await deployments.get("ArrakisV2StaticDeployer")
      ).address
    )) as ArrakisV2StaticDeployer;

    arrakisFactory = (await ethers.getContractAt(
      "IArrakisV2Factory",
      (
        await deployments.get("ArrakisV2Factory")
      ).address
    )) as IArrakisV2Factory;

    const swapperFactory = await ethers.getContractFactory("SwapMock", wallet);

    swapper = (await swapperFactory.deploy()) as SwapMock;

    manager = (await ethers.getContractAt(
      "ArrakisV2StaticManager",
      (
        await deployments.get("ArrakisV2StaticManager")
      ).address
    )) as ArrakisV2StaticManager;

    await manager.connect(owner).setDeployer(staticDeployer.address);

    helper = (await ethers.getContractAt(
      "IArrakisV2Helper",
      (
        await deployments.get("ArrakisV2Helper")
      ).address
    )) as IArrakisV2Helper;

    const tokenUSDC = (await ethers.getContractAt(
      "ERC20",
      addresses.USDC
    )) as ERC20;

    await getFundsFromFaucet(addresses.faucetDai, token0, walletAddress);
    await getFundsFromFaucet(addresses.faucetWeth, token1, walletAddress);
    await getFundsFromFaucet(addresses.faucetUSDC, tokenUSDC, walletAddress);

    rewardToken = tokenUSDC;
  });
  it("static public vault integration test", async function () {
    const { tick: tick05, sqrtPriceX96: sqrtPrice05 } = await pool05.slot0();
    const { tick: tick3, sqrtPriceX96: sqrtPrice3 } = await pool3.slot0();

    const lowerTick05 = tick05 - (tick05 % 10) - 4000;
    const upperTick05 = tick05 - (tick05 % 10) + 10 + 4000;

    const lowerTick3 = tick3 - (tick3 % 60) - 14040;
    const upperTick3 = tick3 - (tick3 % 60) + 60 + 14040;

    const res05 = await resolver.getAmountsForLiquidity(
      sqrtPrice05,
      lowerTick05,
      upperTick05,
      ethers.utils.parseUnits("1", "12")
    );
    const res3 = await resolver.getAmountsForLiquidity(
      sqrtPrice3,
      lowerTick3,
      upperTick3,
      ethers.utils.parseUnits("1", "12")
    );

    const amount0Expected = res05.amount0.add(res3.amount0);
    const amount1Expected = res05.amount1.add(res3.amount1);

    // console.log("expected:", amount0Expected.toString(), amount1Expected.toString());

    const buffer0 = amount0Expected
      .mul(BigNumber.from("5"))
      .div(BigNumber.from("100"));
    const buffer1 = amount1Expected
      .mul(BigNumber.from("5"))
      .div(BigNumber.from("100"));

    await token0
      .connect(wallet)
      .approve(staticDeployer.address, amount0Expected.add(buffer0));
    await token1
      .connect(wallet)
      .approve(staticDeployer.address, amount1Expected.add(buffer1));

    const bal0Before = await token0.balanceOf(wallet.address);
    const bal1Before = await token1.balanceOf(wallet.address);

    const nBefore = await arrakisFactory.numVaults();
    const nGaugeBefore = await gaugeFactory.numGauges();
    expect(nGaugeBefore).to.be.eq(0);

    const tx = await staticDeployer.deployStaticVault({
      positions: [
        {
          liquidity: ethers.utils.parseUnits("1", "12"),
          range: {
            lowerTick: lowerTick05,
            upperTick: upperTick05,
            feeTier: 500,
          },
        },
        {
          liquidity: ethers.utils.parseUnits("1", "12"),
          range: {
            lowerTick: lowerTick3,
            upperTick: upperTick3,
            feeTier: 3000,
          },
        },
      ],
      feeTiers: [500, 3000],
      token0: token0.address,
      token1: token1.address,
      receiver: wallet.address,
      minDeposit0: amount0Expected.sub(buffer0),
      minDeposit1: amount1Expected.sub(buffer1),
      maxDeposit0: amount0Expected.add(buffer0),
      maxDeposit1: amount1Expected.add(buffer1),
      vaultInfo: {
        twapDeviation: 250,
        twapDuration: 2000,
        compoundEnabled: true,
      },
      rewardToken: rewardToken.address,
      rewardDistributor: wallet.address,
    });

    const rc = await tx.wait();
    const event = rc?.events?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (event: any) => event.event === "CreateStaticVault"
    );
    const result = event?.args;

    vault = (await ethers.getContractAt(
      "IArrakisV2",
      result?.vault,
      wallet
    )) as IArrakisV2;

    gauge = (await ethers.getContractAt(
      "IGauge",
      result?.gauge,
      wallet
    )) as IGauge;

    const nAfter = await arrakisFactory.numVaults();
    const nGaugeAfter = await gaugeFactory.numGauges();
    expect(nGaugeAfter).to.be.eq(1);
    expect(nAfter).to.be.gt(nBefore);

    const bal0After = await token0.balanceOf(wallet.address);
    const bal1After = await token1.balanceOf(wallet.address);

    expect(bal0After).to.be.lt(bal0Before);
    expect(bal1After).to.be.lt(bal1Before);

    const staticBal0 = await token0.balanceOf(staticDeployer.address);
    const staticBal1 = await token1.balanceOf(staticDeployer.address);

    const vaultBal0 = await token0.balanceOf(vault.address);
    const vaultBal1 = await token1.balanceOf(vault.address);

    expect(staticBal0).to.be.eq(0);
    expect(staticBal1).to.be.eq(0);
    expect(vaultBal0).to.be.eq(0);
    expect(vaultBal1).to.be.eq(0);

    const balanceBefore = await vault.balanceOf(wallet.address);

    expect(balanceBefore).to.be.gt(0);

    // initialize gauge

    await vault.approve(gauge.address, balanceBefore);

    await gauge.deposit(balanceBefore, wallet.address);

    const balanceAfter = await vault.balanceOf(wallet.address);
    const gaugeBalance = await gauge.balanceOf(wallet.address);

    expect(balanceAfter).to.be.eq(0);
    expect(gaugeBalance).to.be.eq(balanceBefore);

    await rewardToken
      .connect(wallet)
      .approve(gauge.address, ethers.utils.parseUnits("100", "6"));
    await gauge.deposit_reward_token(
      rewardToken.address,
      ethers.utils.parseUnits("100", "6")
    );

    // add liquidity

    const amount0In = ethers.utils.parseEther("1000");
    const amount1In = ethers.utils.parseEther("10");

    await token0.connect(wallet).transfer(admin.address, amount0In);
    await token1.connect(wallet).transfer(admin.address, amount1In);

    const addLiquidityData = {
      amount0Max: amount0In,
      amount1Max: amount1In,
      amount0Min: 0,
      amount1Min: 0,
      amountSharesMin: 0,
      vault: vault.address,
      receiver: admin.address,
      gauge: gauge.address,
    };

    await token0.connect(admin).approve(router.address, amount0In);
    await token1.connect(admin).approve(router.address, amount1In);

    // THIS SECTION IS BECAUSE OF AN ERROR I FOUND IN THE CORE AND
    // WONT BE NEEDED IF WE MAKE AN UPDATE TO CORE TO FIX ROUNDING ISSUES
    // START:
    // await expect(router.connect(admin).addLiquidity(addLiquidityData)).to.be
    //   .reverted;

    // await token0.connect(admin).approve(vault.address, amount0In);
    // await token1.connect(admin).approve(vault.address, amount1In);

    // const { mintAmount } = await resolver.getMintAmounts(
    //   vault.address,
    //   amount0In,
    //   amount1In
    // );

    // await expect(vault.connect(admin).mint(mintAmount, admin.address)).to.be
    //   .reverted;

    // await token0.connect(wallet).transfer(vault.address, 2);
    // await token1.connect(wallet).transfer(vault.address, 2);
    // END

    const balanceGaugeBefore = await gauge.balanceOf(admin.address);
    expect(balanceGaugeBefore).to.be.eq(0);
    const balanceStakedBefore = await vault.balanceOf(gauge.address);

    await router.connect(admin).addLiquidity(addLiquidityData);

    const balanceGaugeAfter = await gauge.balanceOf(admin.address);
    expect(balanceGaugeAfter).to.be.gt(0);
    const balanceVaultAfter = await vault.balanceOf(admin.address);
    expect(balanceVaultAfter).to.be.eq(0);
    const balanceStakedAfter = await vault.balanceOf(gauge.address);
    expect(balanceStakedAfter.sub(balanceStakedBefore)).to.be.eq(
      balanceGaugeAfter
    );

    await token0
      .connect(wallet)
      .approve(swapper.address, await token0.balanceOf(walletAddress));
    await token1
      .connect(wallet)
      .approve(swapper.address, await token1.balanceOf(walletAddress));

    for (let i = 0; i < 2; i++) {
      const slot0 = await pool05.slot0();
      const slot0B = await pool3.slot0();
      await swapper.swap(
        pool05.address,
        true,
        ethers.utils.parseEther("1650000"),
        slot0.sqrtPriceX96.div(2)
      );
      await swapper.swap(
        pool05.address,
        false,
        ethers.utils.parseEther("1000"),
        slot0.sqrtPriceX96.mul(2)
      );
      await swapper.swap(
        pool3.address,
        true,
        ethers.utils.parseEther("1650000"),
        slot0B.sqrtPriceX96.div(2)
      );
      await swapper.swap(
        pool3.address,
        false,
        ethers.utils.parseEther("1000"),
        slot0B.sqrtPriceX96.mul(2)
      );
    }

    const vaultInfo = await manager.vaults(vault.address);
    expect(vaultInfo.compoundEnabled).to.be.true;
    expect(vaultInfo.twapDeviation).to.be.eq(250);
    expect(vaultInfo.twapDuration).to.be.eq(2000);

    const balBefore0 = await token0.balanceOf(vault.address);
    const balBefore1 = await token1.balanceOf(vault.address);

    const feesBefore = await helper.totalUnderlyingWithFees(vault.address);
    expect(feesBefore.fee0).to.be.gt(0);
    expect(feesBefore.fee1).to.be.gt(0);

    await manager.compoundFees(vault.address);

    const balAfter0 = await token0.balanceOf(vault.address);
    const balAfter1 = await token1.balanceOf(vault.address);

    const feesAfter = await helper.totalUnderlyingWithFees(vault.address);
    expect(feesAfter.fee0).to.be.eq(0);
    expect(feesAfter.fee1).to.be.eq(0);

    expect(balAfter0).to.not.be.eq(balBefore0);
    expect(balAfter1).to.not.be.eq(balBefore1);

    const managerBalBefore0 = await token0.balanceOf(admin.address);
    const managerBalBefore1 = await token1.balanceOf(admin.address);

    await expect(
      manager.withdrawAndCollectFees(
        [vault.address],
        [token0.address, token1.address],
        admin.address
      )
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await manager
      .connect(owner)
      .withdrawAndCollectFees(
        [vault.address],
        [token0.address, token1.address],
        admin.address
      );

    const managerBalAfter0 = await token0.balanceOf(admin.address);
    const managerBalAfter1 = await token1.balanceOf(admin.address);

    expect(managerBalAfter0).to.be.gt(managerBalBefore0);
    expect(managerBalAfter1).to.be.gt(managerBalBefore1);
  });
});
