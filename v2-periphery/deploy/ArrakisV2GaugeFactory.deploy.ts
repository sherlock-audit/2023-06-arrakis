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
      `!! Deploying ArrakisV2GaugeFactory to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer, owner, arrakisMultiSig } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);
  await deploy("ArrakisV2GaugeFactory", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      owner: arrakisMultiSig,
      execute: {
        methodName: "initialize",
        args: [owner, addresses.CRV, addresses.veCRV, addresses.veCRVBoost],
      },
    },
    args: [(await deployments.get("ArrakisV2GaugeBeacon")).address],
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
  return shouldSkip;
};

func.tags = ["ArrakisV2GaugeFactory"];
func.dependencies = ["ArrakisV2GaugeBeacon"];
export default func;
