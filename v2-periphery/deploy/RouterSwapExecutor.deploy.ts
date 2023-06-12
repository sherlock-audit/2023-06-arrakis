import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (
    hre.network.name === "mainnet" ||
    hre.network.name === "optimism" ||
    hre.network.name === "polygon" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance" ||
    hre.network.name === "goerli"
  ) {
    console.log(
      `!! Deploying RouterSwapExecutor to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const arrakisV2Router = await deployments.get("ArrakisV2Router");

  await deploy("RouterSwapExecutor", {
    from: deployer,
    args: [arrakisV2Router.address],
    log: hre.network.name !== "hardhat",
  });
};

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip =
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance" ||
    hre.network.name === "goerli";
  return shouldSkip ? true : false;
};

func.tags = ["RouterSwapExecutor"];

func.dependencies = ["ArrakisV2Router"];

export default func;
