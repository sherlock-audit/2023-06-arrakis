/* eslint-disable @typescript-eslint/naming-convention */
import { getAddresses as getCoreAddresses } from "@arrakisfi/v2-core";

export interface Addresses {
  UniswapV3Factory: string;
  ArrakisV2Resolver: string;
  ArrakisV2Helper: string;
  ArrakisV2Factory: string;
  GaugeImplementation: string;
  OneInchRouter: string;
  SwapRouter: string;
  DAI: string;
  USDC: string;
  WETH: string;
  faucetDai: string;
  faucetUSDC: string;
  faucetWeth: string;
  CRV: string;
  veCRV: string;
  veCRVBoost: string;
  Permit2: string;
  ChainLinkUsdcEth: string;
}

export const getAddresses = (network: string): Addresses => {
  const coreAddresses =
    network == "local" || network == "hardhat"
      ? getCoreAddresses("mainnet")
      : getCoreAddresses(network);
  switch (network) {
    case "hardhat":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "0x86D62A8AD19998E315e6242b63eB73F391D4674B",
        OneInchRouter: "0x1111111254EEB25477B68fb85Ed929f73A960582",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
        CRV: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        veCRV: "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2",
        veCRVBoost: "0x8E0c00ed546602fD9927DF742bbAbF726D5B0d16",
        Permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        ChainLinkUsdcEth: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
      };
    case "mainnet":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "0x86D62A8AD19998E315e6242b63eB73F391D4674B",
        OneInchRouter: "0x1111111254EEB25477B68fb85Ed929f73A960582",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
        CRV: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        veCRV: "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2",
        veCRVBoost: "0x8E0c00ed546602fD9927DF742bbAbF726D5B0d16",
        Permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        ChainLinkUsdcEth: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
      };
    case "polygon":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "0x16Bb396868Cc76D179533A18ED6B11a1ec8bd49a",
        OneInchRouter: "",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // IMPORTANT: must be WMATIC
        DAI: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
        USDC: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
        faucetDai: "0x27F8D03b3a2196956ED754baDc28D73be8830A6e",
        faucetUSDC: "0x1a13F4Ca1d028320A707D99520AbFefca3998b7F",
        faucetWeth: "0x28424507fefb6f7f8e9d3860f56504e4e5f5f390",
        CRV: "0x3755CEaa62F70B989f1DE71d6b868cEd2dAD0D32",
        veCRV: "0x9d9208c87dc9b3a458Af62f510fdEC401a08DDc0",
        veCRVBoost: "0x9a1cF3931e682C32acF35b1D238090560B4815E5",
        Permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        ChainLinkUsdcEth: "",
      };
    case "optimism":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "0xe03311D30bdeb60511BAe8de135C6524B9576B2e",
        OneInchRouter: "",
        SwapRouter: "",
        WETH: "0x4200000000000000000000000000000000000006",
        DAI: "",
        USDC: "",
        faucetDai: "",
        faucetUSDC: "",
        faucetWeth: "",
        CRV: "0xB9BB2856e0Af9d3e855b0173A40059Fc29b632dA",
        veCRV: "0xd158CCfabef917ae2f01E454D07E1F2055e44c79",
        veCRVBoost: "0x336649aEb266f3182d63f4FAD7B3cF0dBa15f4c8",
        Permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        ChainLinkUsdcEth: "",
      };
    case "arbitrum":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "0x4Ace4b3eb96BD7b3136aB7e14f070717a8137be8",
        OneInchRouter: "",
        SwapRouter: "",
        WETH: "",
        DAI: "",
        USDC: "",
        faucetDai: "",
        faucetUSDC: "",
        faucetWeth: "",
        CRV: "0xf397073BF8AA624271EFcF01952f448BD82bf1C4",
        veCRV: "0x0bF220343ba29a422db1577eD2DdA173c39A42DE",
        veCRVBoost: "0x31a38B9B9E4b134bDF2559605EB6FC30F24a47D5",
        Permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        ChainLinkUsdcEth: "",
      };
    case "local":
      return {
        UniswapV3Factory: coreAddresses.UniswapV3Factory,
        ArrakisV2Resolver: coreAddresses.ArrakisV2Resolver,
        ArrakisV2Helper: coreAddresses.ArrakisV2Helper,
        ArrakisV2Factory: coreAddresses.ArrakisV2Factory,
        GaugeImplementation: "0x86D62A8AD19998E315e6242b63eB73F391D4674B",
        OneInchRouter: "0x1111111254fb6c44bac0bed2854e76f90643097d",
        SwapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        faucetDai: "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
        faucetUSDC: "0x0a59649758aa4d66e25f08dd01271e891fe52199",
        faucetWeth: "0xf04a5cc80b1e94c69b48f5ee68a08cd2f09a7c3e",
        CRV: "0xD533a949740bb3306d119CC777fa900bA034cd52",
        veCRV: "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2",
        veCRVBoost: "0x8E0c00ed546602fD9927DF742bbAbF726D5B0d16",
        Permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        ChainLinkUsdcEth: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
      };
    default:
      throw new Error(`No addresses for Network: ${network}`);
  }
};
