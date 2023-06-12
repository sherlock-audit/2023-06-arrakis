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
      `!! Deploying RouterSwapResolver to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);
  if (hre.network.name == "hardhat") {
    await deploy("RouterSwapResolver", {
      from: deployer,
      args: [
        (await deployments.get("ArrakisV2Helper")).address,
        (await deployments.get("ArrakisV2Resolver")).address,
      ],
      log: false,
    });
  } else {
    await deploy("RouterSwapResolver", {
      from: deployer,
      args: [addresses.ArrakisV2Helper, addresses.ArrakisV2Resolver],
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

func.tags = ["RouterSwapResolver"];
// !!! comment out ArrakisV2Helper, ArrakisV2Resolver dependency for mainnets
func.dependencies = ["ArrakisV2Helper", "ArakisV2Resolver"];
export default func;
