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
      `!! Deploying ArrakisV2Router to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer, owner, arrakisMultiSig } = await getNamedAccounts();
  const addresses = getAddresses(hre.network.name);
  if (hre.network.name == "hardhat") {
    await deploy("ArrakisV2Router", {
      from: deployer,
      proxy: {
        proxyContract: "OpenZeppelinTransparentProxy",
        owner: arrakisMultiSig,
        execute: {
          methodName: "initialize",
          args: [owner],
        },
      },
      args: [
        addresses.WETH,
        (await deployments.get("ArrakisV2Resolver")).address,
        addresses.Permit2,
      ],
      log: false,
    });
  } else {
    await deploy("ArrakisV2Router", {
      from: deployer,
      proxy: {
        proxyContract: "OpenZeppelinTransparentProxy",
        owner: arrakisMultiSig,
        execute: {
          methodName: "initialize",
          args: [owner],
        },
      },
      args: [addresses.WETH, addresses.ArrakisV2Resolver, addresses.Permit2],
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

func.tags = ["ArrakisV2Router"];
// !!! comment out ArrakisV2Resolver dependency for mainnets
func.dependencies = ["ArrakisV2Resolver"];
export default func;
