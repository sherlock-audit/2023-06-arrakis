import { expect } from "chai";
import { deployments, ethers, network } from "hardhat";
import {
  ArrakisV2GaugeBeacon,
  ArrakisV2GaugeFactory,
  ERC20,
  IArrakisV2,
  IGauge,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Addresses, getAddresses } from "../src/addresses";
import { Contract } from "ethers";
import {
  deployArrakisV2,
  getFundsFromFaucet,
  getArrakisResolver,
} from "../src/testEnvUtils";
import Gauge from "../src/LiquidityGaugeV4.json";

let addresses: Addresses;

describe("ArrakisV2GaugeFactory tests", function () {
  this.timeout(0);
  let wallet: SignerWithAddress;
  let walletAddress: string;

  let admin: SignerWithAddress;
  let owner: SignerWithAddress;

  let token0: ERC20;
  let token1: ERC20;

  let resolver: Contract;

  let vault: IArrakisV2;

  let gaugeFactory: ArrakisV2GaugeFactory;
  let gaugeBeacon: ArrakisV2GaugeBeacon;

  let gauge: IGauge;

  before(async function () {
    await deployments.fixture();

    addresses = getAddresses(network.name);
    [wallet, admin, owner] = await ethers.getSigners();
    walletAddress = await wallet.getAddress();

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

    await getFundsFromFaucet(addresses.faucetDai, token0, walletAddress);
    await getFundsFromFaucet(addresses.faucetWeth, token1, walletAddress);
  });
  it("#0 : should deploy gauge", async function () {
    const n0 = await gaugeFactory.numGauges();
    expect(n0).to.be.eq(0);
    await gaugeFactory.deployGauge(
      vault.address,
      token0.address,
      walletAddress
    );
    const n1 = await gaugeFactory.numGauges();
    expect(n1).to.be.eq(1);

    const gaugeAddress = (await gaugeFactory.gauges(0, 1))[0];
    gauge = (await ethers.getContractAt(
      "IGauge",
      gaugeAddress,
      wallet
    )) as IGauge;

    const stakingToken = await gauge.staking_token();
    expect(stakingToken).to.be.eq(vault.address);

    const nRewards = await gauge.reward_count();
    expect(nRewards).to.be.eq(2);

    const reward0 = await gauge.reward_tokens(0);
    expect(reward0).to.be.eq(addresses.CRV);
    const reward1 = await gauge.reward_tokens(1);
    expect(reward1).to.be.eq(token0.address);

    const tx = await gaugeFactory.deployGauge(
      vault.address,
      token0.address,
      walletAddress
    );
    await tx.wait();
    const n2 = await gaugeFactory.numGauges();
    expect(n2).to.be.eq(2);
    const gaugeAddressCheck = await gaugeFactory.gauges(0, 1);
    const gauge2Address = await gaugeFactory.gauges(1, 2);
    expect(gaugeAddressCheck.length).to.be.eq(1);
    expect(gauge2Address.length).to.be.eq(1);
    expect(gaugeAddressCheck[0]).to.be.eq(gaugeAddress);
    expect(gauge2Address[0]).to.not.be.eq(gaugeAddress);
    const gaugeAddresses = await gaugeFactory.gauges(0, 2);
    expect(gaugeAddresses.length).to.be.eq(2);
    expect(gaugeAddresses[0]).to.be.eq(gaugeAddress);
    expect(gaugeAddresses[1]).to.be.eq(gauge2Address[0]);
  });
  it("#1 : should deposit reward token", async function () {
    await token0.connect(wallet).approve(gauge.address, 1);
    await gauge.deposit_reward_token(token0.address, 1);
  });
  it("#2 : should set rewards via factory", async function () {
    await expect(
      gaugeFactory
        .connect(wallet)
        .setGaugeRewardDistributor(gauge.address, token0.address, admin.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await gaugeFactory
      .connect(owner)
      .setGaugeRewardDistributor(gauge.address, token0.address, admin.address);

    await token0.connect(wallet).approve(gauge.address, 1);
    await expect(gauge.deposit_reward_token(token0.address, 1)).to.be.reverted;

    await token0.connect(wallet).transfer(admin.address, 1);

    await token0.connect(admin).approve(gauge.address, 1);
    await gauge.connect(admin).deposit_reward_token(token0.address, 1);

    await expect(
      gaugeFactory
        .connect(wallet)
        .addGaugeReward(gauge.address, token1.address, walletAddress)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      gaugeFactory
        .connect(owner)
        .addGaugeReward(gauge.address, token0.address, walletAddress)
    ).to.be.revertedWith("AE");

    const nRewards = await gauge.reward_count();

    expect(nRewards).to.be.eq(2);

    await gaugeFactory
      .connect(owner)
      .addGaugeReward(gauge.address, token1.address, walletAddress);

    const nRewardsAfter = await gauge.reward_count();

    expect(nRewardsAfter).to.be.eq(3);

    const reward0 = await gauge.reward_tokens(1);
    expect(reward0).to.be.eq(token0.address);
    const reward1 = await gauge.reward_tokens(2);
    expect(reward1).to.be.eq(token1.address);
  });
});
