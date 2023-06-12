import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getAddresses } from "../src/addresses";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  if (
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "goerli" ||
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance"
  ) {
    console.log(
      `Deploying ArrakisV2GaugeBeacon to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer, arrakisMultiSig } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);

  if (hre.network.name == "hardhat")
    await deploy("ArrakisV2GaugeBeacon", {
      from: deployer,
      args: [addresses.GaugeImplementation, deployer],
      log: false,
    });
  else
    await deploy("ArrakisV2GaugeBeacon", {
      from: deployer,
      args: [addresses.GaugeImplementation, arrakisMultiSig],
      log: true,
    });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip =
    hre.network.name === "mainnet" ||
    hre.network.name === "polygon" ||
    hre.network.name === "goerli" ||
    hre.network.name === "optimism" ||
    hre.network.name === "arbitrum" ||
    hre.network.name === "binance";
  return shouldSkip ? true : false;
};

func.tags = ["ArrakisV2GaugeBeacon"];
