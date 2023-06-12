import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getAddresses } from "../src/addresses";

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
      `!! Deploying ArrakisV2StaticDeployer to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);
  if (hre.network.name == "hardhat") {
    await deploy("ArrakisV2StaticDeployer", {
      from: deployer,
      args: [
        addresses.UniswapV3Factory,
        (await deployments.get("ArrakisV2Factory")).address,
        (await deployments.get("ArrakisV2GaugeFactory")).address,
        (await deployments.get("ArrakisV2StaticManager")).address,
        (await deployments.get("ArrakisV2Resolver")).address,
      ],
      log: false,
    });
  } else {
    await deploy("ArrakisV2StaticDeployer", {
      from: deployer,
      args: [
        addresses.UniswapV3Factory,
        addresses.ArrakisV2Factory,
        (await deployments.get("ArrakisV2GaugeFactory")).address,
        (await deployments.get("ArrakisV2StaticManager")).address,
        addresses.ArrakisV2Resolver,
      ],
      log: true,
    });
  }
};

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip =
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance" ||
    hre.network.name === "goerli";
  return shouldSkip;
};

func.tags = ["ArrakisV2StaticDeployer"];
// !!! comment out ArrakisV2Resolver and ArrakisV2Factory dependency for mainnets
func.dependencies = [
  "ArrakisV2Resolver",
  "ArrakisV2Factory",
  "ArrakisV2GaugeFactory",
  "ArrakisV2StaticManager",
];
export default func;
