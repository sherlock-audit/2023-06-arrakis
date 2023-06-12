import fetch from "node-fetch";

type OneInchDataType = { to: string; data: string };

const approveTokenData = async (
  networkId: string,
  tokenAddress: string,
  amount: string
): Promise<OneInchDataType> => {
  try {
    const apiResponse = (await (
      await fetch(
        `https://api.1inch.io/v4.0/${networkId}/approve/transaction?amount=${amount}&tokenAddress=${tokenAddress}`
      )
    ).json()) as unknown as {
      data: string;
      gasPrice: string;
      to: string;
      value: string;
    };

    return {
      to: apiResponse.to,
      data: apiResponse.data,
    };
  } catch (error) {
    console.log(
      `1Inch approve data call failed, for ${amount} amount of ${tokenAddress}. Error : ${error}`
    );
    throw new Error(`approveTokenData: 1Inch approve data call failed.`);
  }
};

const swapTokenData = async (
  networkId: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  fromAddress: string,
  slippage: string
): Promise<OneInchDataType> => {
  try {
    const apiResponse = (await (
      await fetch(
        `https://api.1inch.io/v5.0/${networkId}/swap?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&fromAddress=${fromAddress}&slippage=${slippage}&disableEstimate=true&allowPartialFill=false`
      )
    ).json()) as unknown as {
      tx: {
        from: string;
        to: string;
        data: string;
        value: string;
        gasPrice: string;
        gas: string;
      };
    };

    return {
      to: apiResponse.tx.to,
      data: apiResponse.tx.data,
    };
  } catch (error) {
    console.log(
      `1Inch swap data call failed, wanted to swap ${amount} amount of ${fromTokenAddress} to ${toTokenAddress}, from ${fromAddress} with a slippage of ${slippage} . Error : ${error}`
    );
    throw new Error(`swapTokenData: 1Inch swap data call failed.`);
  }
};

const quote1Inch = async (
  networkId: string,
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string
): Promise<string> => {
  try {
    const apiResponse = (await (
      await fetch(
        `https://api.1inch.io/v5.0/${networkId}/quote?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}`
      )
    ).json()) as unknown as {
      toTokenAmount: string;
    };

    // console.log("network : ", networkId);
    // console.log("fromTokenAddress : ", fromTokenAddress);
    // console.log("toTokenAddress : ", toTokenAddress);
    // console.log("amount : ", amount);

    return apiResponse.toTokenAmount;
  } catch (error) {
    console.log(
      `1Inch quote call failed, wanted to quote swap of ${amount} amount of ${fromTokenAddress} to ${toTokenAddress}. Error : ${error}`
    );
    throw new Error(`quote1Inch: 1Inch swap data call failed.`);
  }
};

// Because we pin a blockNumber in the tests,
// using live 1inch api often causes as the price on current vs pinned block can vary
// we store valid payloads from 1inch api for the pinned block here to be used in the tests
type MockPayloadObj = {
  swapIn: string;
  swapOut: string;
  payload: string;
};

type MockPayloadScenario = {
  [index: string]: MockPayloadObj;
};

type MockPayloads = {
  [vaultAddress: string]: MockPayloadScenario;
};
/* eslint-disable @typescript-eslint/naming-convention */
const mockPayloads: MockPayloads = {
  "DAI/WETH": {
    // depositing 100k dai and 2 weth
    scenario1: {
      swapIn: "21937354479478239630733",
      swapOut: "13300268778072983844",
      payload:
        "0xe449022e0000000000000000000000000000000000000000000004a539f3560004c7958d0000000000000000000000000000000000000000000000005c4a05fe2f212492000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000020000000000000000000000005777d92f208679db4b9778590fa3cab3ac9e216800000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640cfee7c08",
    },

    // depositing 10 dai and 5 weth
    scenario2: {
      swapIn: "4998039407028926993",
      swapOut: "8239622410997700048082",
      payload:
        "0xe449022e000000000000000000000000000000000000000000000000455c9a5c255cfa110000000000000000000000000000000000000000000000df55dd9fb4b8c89a690000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000180000000000000000000000060594a405d53811d3bc4766596efd80fd545a270cfee7c08",
    },

    // depositing 100k dai and 0 weth
    scenario3: {
      swapIn: "24430287316526651400000",
      swapOut: "14811654254722799048",
      payload:
        "0xe449022e00000000000000000000000000000000000000000000052c5e57ed2bde1fdf4000000000000000000000000000000000000000000000000066c6c888da53eae4000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000020000000000000000000000005777d92f208679db4b9778590fa3cab3ac9e216800000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640cfee7c08",
    },

    // depositing 0 dai and 5 weth
    scenario4: {
      swapIn: "4999999405560444295",
      swapOut: "8242852527433410815238",
      payload:
        "0xe449022e000000000000000000000000000000000000000000000000456390f7dd9835870000000000000000000000000000000000000000000000df6c4776991fa112830000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000180000000000000000000000060594a405d53811d3bc4766596efd80fd545a270cfee7c08",
    },
  },
  "USDC/WETH": {
    // depositing 100k usdc and 2 weth
    scenario1: {
      swapIn: "44843623677",
      swapOut: "27189628575760351989",
      payload:
        "0xe449022e0000000000000000000000000000000000000000000000000000000a70e364fd00000000000000000000000000000000000000000000000166772e87132f59580000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640cfee7c08",
    },

    // depositing 10 usdc and 5 weth
    scenario2: {
      swapIn: "4994706233737409247",
      swapOut: "8230893262",
      payload:
        "0xe449022e0000000000000000000000000000000000000000000000004550c2db4358f2df00000000000000000000000000000000000000000000000000000001d1fc61af000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000018000000000000000000000008ad599c3a0ff1de082011efddc58f1908eb6e6d8cfee7c08",
    },

    // depositing 1000 usdc and 0 weth
    scenario3: {
      swapIn: "466093349",
      swapOut: "282552011673396471",
      payload:
        "0xe449022e000000000000000000000000000000000000000000000000000000001bc8052500000000000000000000000000000000000000000000000003b9a294680becb70000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000100000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640cfee7c08",
    },

    // depositing 0 usdc and 5 weth
    scenario4: {
      swapIn: "4999998394294398570",
      swapOut: "8239615289",
      payload:
        "0xe449022e0000000000000000000000000000000000000000000000004563900c6970ee6a00000000000000000000000000000000000000000000000000000001d290395c0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000180000000000000000000000088e6a0c2ddd26feeb64f039a2c41296fcb3f5640cfee7c08",
    },
  },
};

export {
  swapTokenData,
  quote1Inch,
  approveTokenData,
  mockPayloads,
  OneInchDataType,
  MockPayloads,
  MockPayloadScenario,
  MockPayloadObj,
};
