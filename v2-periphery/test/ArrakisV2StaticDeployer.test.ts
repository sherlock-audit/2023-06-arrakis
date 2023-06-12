import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  ArrakisV2GaugeBeacon,
  ArrakisV2GaugeFactory,
  ArrakisV2StaticDeployer,
  ArrakisV2StaticManager,
  ERC20,
  IArrakisV2,
  IArrakisV2Factory,
  IGauge,
  IUniswapV3Pool,
  IUniswapV3Factory,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import { BigNumber, Contract } from "ethers";
import { getFundsFromFaucet, getArrakisResolver } from "../src/testEnvUtils";
import Gauge from "../src/LiquidityGaugeV4.json";

let addresses: Addresses;

describe("ArrakisV2StaticDeployer tests", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let owner: SignerWithAddress;

  let token0: ERC20;
  let token1: ERC20;

  let resolver: Contract;

  let vault: IArrakisV2;
  let pool05: IUniswapV3Pool;
  let pool3: IUniswapV3Pool;

  let uniFactory: IUniswapV3Factory;

  let gaugeFactory: ArrakisV2GaugeFactory;
  let gaugeBeacon: ArrakisV2GaugeBeacon;

  let arrakisFactory: IArrakisV2Factory;

  let staticDeployer: ArrakisV2StaticDeployer;

  let gauge: IGauge;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet, , owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

    resolver = await getArrakisResolver(owner);

    token0 = (await ethers.getContractAt("ERC20", addresses.DAI)) as ERC20;
    token1 = (await ethers.getContractAt("ERC20", addresses.WETH)) as ERC20;

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

    const manager = (await ethers.getContractAt(
      "ArrakisV2StaticManager",
      (
        await deployments.get("ArrakisV2StaticManager")
      ).address
    )) as ArrakisV2StaticManager;

    await manager.connect(owner).setDeployer(staticDeployer.address);

    arrakisFactory = (await ethers.getContractAt(
      "IArrakisV2Factory",
      await staticDeployer.arrakisFactory()
    )) as IArrakisV2Factory;

    const tokenUSDC = (await ethers.getContractAt(
      "ERC20",
      addresses.USDC
    )) as ERC20;

    await getFundsFromFaucet(addresses.faucetDai, token0, walletAddress);
    await getFundsFromFaucet(addresses.faucetWeth, token1, walletAddress);
    await getFundsFromFaucet(addresses.faucetUSDC, tokenUSDC, walletAddress);
  });
  it("#0 : deploy static vault (small value)", async function () {
    const { tick: tick05, sqrtPriceX96: sqrtPrice05 } = await pool05.slot0();
    const { tick: tick3, sqrtPriceX96: sqrtPrice3 } = await pool3.slot0();

    const lowerTick05 = tick05 - (tick05 % 10) - 2500;
    const upperTick05 = tick05 - (tick05 % 10) + 10 + 2500;

    const lowerTick3 = tick3 - (tick3 % 60) - 12000;
    const upperTick3 = tick3 - (tick3 % 60) + 60 + 12000;

    const res05 = await resolver.getAmountsForLiquidity(
      sqrtPrice05,
      lowerTick05,
      upperTick05,
      ethers.utils.parseUnits("1", "5")
    );
    const res3 = await resolver.getAmountsForLiquidity(
      sqrtPrice3,
      lowerTick3,
      upperTick3,
      ethers.utils.parseUnits("1", "5")
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
          liquidity: ethers.utils.parseUnits("1", "5"),
          range: {
            lowerTick: lowerTick05,
            upperTick: upperTick05,
            feeTier: 500,
          },
        },
        {
          liquidity: ethers.utils.parseUnits("1", "5"),
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
      rewardToken: token0.address,
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

    // test gauge

    await vault.approve(gauge.address, balanceBefore);

    await gauge.deposit(balanceBefore, wallet.address);

    const balanceAfter = await vault.balanceOf(wallet.address);
    const gaugeBalance = await gauge.balanceOf(wallet.address);

    expect(balanceAfter).to.be.eq(0);
    expect(gaugeBalance).to.be.eq(balanceBefore);

    await token0
      .connect(wallet)
      .approve(gauge.address, ethers.utils.parseEther("1"));
    await gauge.deposit_reward_token(
      token0.address,
      ethers.utils.parseEther("1")
    );
  });
  it("#1 : deploy static vault (large value)", async function () {
    const { tick: tick05, sqrtPriceX96: sqrtPrice05 } = await pool05.slot0();
    const { tick: tick3, sqrtPriceX96: sqrtPrice3 } = await pool3.slot0();

    const lowerTick05 = tick05 - (tick05 % 10) - 2500;
    const upperTick05 = tick05 - (tick05 % 10) + 10 + 2500;

    const lowerTick3 = tick3 - (tick3 % 60) - 12000;
    const upperTick3 = tick3 - (tick3 % 60) + 60 + 12000;

    const res05 = await resolver.getAmountsForLiquidity(
      sqrtPrice05,
      lowerTick05,
      upperTick05,
      ethers.utils.parseUnits("1", "22")
    );
    const res3 = await resolver.getAmountsForLiquidity(
      sqrtPrice3,
      lowerTick3,
      upperTick3,
      ethers.utils.parseUnits("1", "22")
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

    const tx = await staticDeployer.deployStaticVault({
      positions: [
        {
          liquidity: ethers.utils.parseUnits("1", "22"),
          range: {
            lowerTick: lowerTick05,
            upperTick: upperTick05,
            feeTier: 500,
          },
        },
        {
          liquidity: ethers.utils.parseUnits("1", "22"),
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
      rewardToken: ethers.constants.AddressZero,
      rewardDistributor: ethers.constants.AddressZero,
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

    expect(result?.gauge).to.be.eq(ethers.constants.AddressZero);

    const nAfter = await arrakisFactory.numVaults();
    const nGaugeAfter = await gaugeFactory.numGauges();
    expect(nGaugeAfter).to.be.eq(nGaugeBefore);
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
  });
  it("#2 : deploy static vault (different decimals)", async function () {
    pool05 = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniFactory.getPool(addresses.USDC, addresses.WETH, 500)
    )) as IUniswapV3Pool;

    pool3 = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniFactory.getPool(addresses.USDC, addresses.WETH, 3000)
    )) as IUniswapV3Pool;

    token0 = (await ethers.getContractAt(
      "ERC20",
      await pool3.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await pool3.token1()
    )) as ERC20;

    const { tick: tick05, sqrtPriceX96: sqrtPrice05 } = await pool05.slot0();
    const { tick: tick3, sqrtPriceX96: sqrtPrice3 } = await pool3.slot0();

    const lowerTick05 = tick05 - (tick05 % 10) - 2500;
    const upperTick05 = tick05 - (tick05 % 10) + 10 + 2500;

    const lowerTick3 = tick3 - (tick3 % 60) - 12000;
    const upperTick3 = tick3 - (tick3 % 60) + 60 + 12000;

    const res05 = await resolver.getAmountsForLiquidity(
      sqrtPrice05,
      lowerTick05,
      upperTick05,
      ethers.utils.parseUnits("1", "18")
    );
    const res3 = await resolver.getAmountsForLiquidity(
      sqrtPrice3,
      lowerTick3,
      upperTick3,
      ethers.utils.parseUnits("1", "18")
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

    const tx = await staticDeployer.deployStaticVault({
      positions: [
        {
          liquidity: ethers.utils.parseUnits("1", "18"),
          range: {
            lowerTick: lowerTick05,
            upperTick: upperTick05,
            feeTier: 500,
          },
        },
        {
          liquidity: ethers.utils.parseUnits("1", "18"),
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
      rewardToken: ethers.constants.AddressZero,
      rewardDistributor: ethers.constants.AddressZero,
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

    expect(result?.gauge).to.be.eq(ethers.constants.AddressZero);

    const nAfter = await arrakisFactory.numVaults();
    const nGaugeAfter = await gaugeFactory.numGauges();
    expect(nGaugeAfter).to.be.eq(nGaugeBefore);
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
  });
  it("#3 : deploy static vault (one sided)", async function () {
    const { tick: tick05, sqrtPriceX96: sqrtPrice05 } = await pool05.slot0();

    const lowerTick05 = tick05 - (tick05 % 10) + 10;
    const upperTick05 = tick05 - (tick05 % 10) + 510;

    const res05 = await resolver.getAmountsForLiquidity(
      sqrtPrice05,
      lowerTick05,
      upperTick05,
      ethers.utils.parseUnits("1", "18")
    );

    const amount0Expected = res05.amount0;
    const amount1Expected = res05.amount1;

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

    const tx = await staticDeployer.deployStaticVault({
      positions: [
        {
          liquidity: ethers.utils.parseUnits("1", "18"),
          range: {
            lowerTick: lowerTick05,
            upperTick: upperTick05,
            feeTier: 500,
          },
        },
      ],
      feeTiers: [500],
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
        compoundEnabled: false,
      },
      rewardToken: ethers.constants.AddressZero,
      rewardDistributor: ethers.constants.AddressZero,
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

    expect(result?.gauge).to.be.eq(ethers.constants.AddressZero);

    const nAfter = await arrakisFactory.numVaults();
    const nGaugeAfter = await gaugeFactory.numGauges();
    expect(nGaugeAfter).to.be.eq(nGaugeBefore);
    expect(nAfter).to.be.gt(nBefore);

    const bal0After = await token0.balanceOf(wallet.address);
    const bal1After = await token1.balanceOf(wallet.address);

    expect(bal0After).to.be.lt(bal0Before);
    expect(bal1After).to.be.eq(bal1Before);

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
  });
  it("#4 : deploy static vault (one sided, other side)", async function () {
    const { tick: tick05, sqrtPriceX96: sqrtPrice05 } = await pool05.slot0();

    const lowerTick05 = tick05 - (tick05 % 10) - 2000;
    const upperTick05 = tick05 - (tick05 % 10);

    const res05 = await resolver.getAmountsForLiquidity(
      sqrtPrice05,
      lowerTick05,
      upperTick05,
      ethers.utils.parseUnits("1", "18")
    );

    const amount0Expected = res05.amount0;
    const amount1Expected = res05.amount1;

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

    const tx = await staticDeployer.deployStaticVault({
      positions: [
        {
          liquidity: ethers.utils.parseUnits("1", "18"),
          range: {
            lowerTick: lowerTick05,
            upperTick: upperTick05,
            feeTier: 500,
          },
        },
      ],
      feeTiers: [500],
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
        compoundEnabled: false,
      },
      rewardToken: ethers.constants.AddressZero,
      rewardDistributor: ethers.constants.AddressZero,
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

    expect(result?.gauge).to.be.eq(ethers.constants.AddressZero);

    const nAfter = await arrakisFactory.numVaults();
    const nGaugeAfter = await gaugeFactory.numGauges();
    expect(nGaugeAfter).to.be.eq(nGaugeBefore);
    expect(nAfter).to.be.gt(nBefore);

    const bal0After = await token0.balanceOf(wallet.address);
    const bal1After = await token1.balanceOf(wallet.address);

    expect(bal0After).to.be.eq(bal0Before);
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
  });
  it("#2 : deploy static vault (different decimals)", async function () {
    const pool01 = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniFactory.getPool(addresses.USDC, addresses.DAI, 100)
    )) as IUniswapV3Pool;

    pool05 = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniFactory.getPool(addresses.USDC, addresses.DAI, 500)
    )) as IUniswapV3Pool;

    pool3 = (await ethers.getContractAt(
      "IUniswapV3Pool",
      await uniFactory.getPool(addresses.USDC, addresses.DAI, 3000)
    )) as IUniswapV3Pool;

    token0 = (await ethers.getContractAt(
      "ERC20",
      await pool3.token0()
    )) as ERC20;
    token1 = (await ethers.getContractAt(
      "ERC20",
      await pool3.token1()
    )) as ERC20;

    const { tick: tick01, sqrtPriceX96: sqrtPrice01 } = await pool01.slot0();
    const { tick: tick05, sqrtPriceX96: sqrtPrice05 } = await pool05.slot0();
    const { tick: tick3, sqrtPriceX96: sqrtPrice3 } = await pool3.slot0();

    const lower0 = tick01 - 2;
    const upper0 = tick01 + 2;

    const lower1 = tick05 - (tick05 % 10) - 10;
    const upper1 = tick05 - (tick05 % 10) + 20;

    const lower2 = tick05 - (tick05 % 10);
    const upper2 = tick05 - (tick05 % 10) + 10;

    const lower3 = tick3 - (tick3 % 60) - 120;
    const upper3 = tick3 - (tick3 % 60) + 60;

    const lower4 = tick3 - (tick3 % 60) - 60;
    const upper4 = tick3 - (tick3 % 60);

    const lower5 = tick3 - (tick3 % 60) + 300;
    const upper5 = tick3 - (tick3 % 60) + 420;

    let amount0Expected = ethers.constants.Zero;
    let amount1Expected = ethers.constants.Zero;

    const lowers = [lower0, lower1, lower2, lower3, lower4, lower5];
    const uppers = [upper0, upper1, upper2, upper3, upper4, upper5];
    const prices = [
      sqrtPrice01,
      sqrtPrice05,
      sqrtPrice05,
      sqrtPrice3,
      sqrtPrice3,
      sqrtPrice3,
    ];
    const tiers = [100, 500, 500, 3000, 3000, 3000];

    const positions: any[] = [];

    for (let i = 0; i < lowers.length; i++) {
      const res = await resolver.getAmountsForLiquidity(
        prices[i],
        lowers[i],
        uppers[i],
        ethers.utils.parseUnits("1", "15")
      );
      amount0Expected = amount0Expected.add(res.amount0);
      amount1Expected = amount1Expected.add(res.amount1);
      positions.push({
        liquidity: ethers.utils.parseUnits("1", "15"),
        range: {
          lowerTick: lowers[i],
          upperTick: uppers[i],
          feeTier: tiers[i],
        },
      });
    }

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

    const tx = await staticDeployer.deployStaticVault({
      positions: positions,
      feeTiers: [100, 500, 3000],
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
      rewardToken: ethers.constants.AddressZero,
      rewardDistributor: ethers.constants.AddressZero,
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

    expect(result?.gauge).to.be.eq(ethers.constants.AddressZero);

    const nAfter = await arrakisFactory.numVaults();
    const nGaugeAfter = await gaugeFactory.numGauges();
    expect(nGaugeAfter).to.be.eq(nGaugeBefore);
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
  });
});
