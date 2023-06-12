import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

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
      `Deploying ArrakisV2Factory to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await new Promise((r) => setTimeout(r, 20000));
  }

  const { deploy } = deployments;
  const { deployer, arrakisMultiSig, owner } = await getNamedAccounts();

  await deploy("ArrakisV2Factory", {
    from: deployer,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      owner: arrakisMultiSig,
      execute: {
        methodName: "initialize",
        args: [owner],
      },
    },
    args: [(await deployments.get("ArrakisV2Beacon")).address],
    log: hre.network.name != "hardhat" ? true : false,
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
func.tags = ["ArrakisV2Factory"];
func.dependencies = ["ArrakisV2Beacon"];
