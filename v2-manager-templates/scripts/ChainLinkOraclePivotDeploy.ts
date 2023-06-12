import hre, { ethers, deployments, getNamedAccounts } from "hardhat";

const token0 = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const token1 = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";
const priceFeedA = "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612";
const priceFeedB = "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3";
const sequencerUpTimeFeed = "0xFdB631F5EE196F0ed6FAa767959853A9F217697D";
const outdated = 3600 * 24;
const isPriceFeedAInversed = false;
const isPriceFeedBInversed = true;

async function main() {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const token0Decimals = await (
    await ethers.getContractAt(
      ["function decimals() external view returns (uint8)"],
      token0,
      deployer
    )
  ).decimals();
  const token1Decimals = await (
    await ethers.getContractAt(
      ["function decimals() external view returns (uint8)"],
      token1,
      deployer
    )
  ).decimals();

  const deployResult = await deploy("ChainLinkOraclePivot", {
    from: deployer,
    args: [
      token0Decimals,
      token1Decimals,
      priceFeedA,
      priceFeedB,
      sequencerUpTimeFeed,
      outdated,
      isPriceFeedAInversed,
      isPriceFeedBInversed,
    ],
    log: hre.network.name !== "hardhat" ? true : false,
  });

  console.log(`contract address ${deployResult.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
