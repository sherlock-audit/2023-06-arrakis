import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  RouterSwapExecutor,
  ArrakisV2Router,
  RouterSwapResolver,
  ERC20,
  IArrakisV2,
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  swapTokenData,
  quote1Inch,
  mockPayloads,
  OneInchDataType,
} from "./oneInchApiIntegration";
import { BigNumber, ContractTransaction, Contract } from "ethers";
import { Addresses, getAddresses } from "./addresses";

const addresses: Addresses = getAddresses(network.name);

export const swapAndAddTest = async (
  signer: SignerWithAddress,

  router: ArrakisV2Router,
  swapExecutor: RouterSwapExecutor,
  swapResolver: RouterSwapResolver,

  resolver: Contract,

  vault: IArrakisV2,
  token0: ERC20,
  token1: ERC20,
  rakisToken: ERC20,

  amount0Max: BigNumber,
  amount1Max: BigNumber,
  zeroForOne: boolean,
  slippage: number,
  useETH: boolean,
  mockPayloadScenario?: string,
  stRakisToken?: ERC20,
  transactionEthValue?: BigNumber,
  rebalance?: boolean
) => {
  // flag for easily switching between live 1inch api and stored mock payloads
  const shouldUseMockPayloads = true;

  const signerAddress = await signer.getAddress();

  // formatting amounts
  const decimalsToken0 = await token0.decimals();
  const decimalsToken1 = await token1.decimals();
  amount0Max = ethers.utils.parseUnits(amount0Max.toString(), decimalsToken0);
  amount1Max = ethers.utils.parseUnits(amount1Max.toString(), decimalsToken1);

  const isToken0Weth: boolean = token0.address === addresses.WETH;

  // amounts used for getMintAmounts(), to be filled later depending on swap amounts
  let amount0Use: BigNumber;
  let amount1Use: BigNumber;

  // approve the generic router for user's max amounts
  if (amount0Max.gt(0)) {
    await token0.connect(signer).approve(router.address, amount0Max);
  }
  if (amount1Max.gt(0)) {
    await token1.connect(signer).approve(router.address, amount1Max);
  }

  // get before balances
  const balanceRakisBefore = await rakisToken.balanceOf(signerAddress);
  const balanceStRakisBefore = stRakisToken
    ? await stRakisToken.balanceOf(signerAddress)
    : ethers.BigNumber.from(0);

  // we store working payloads from 1inch API for the swaps needed for tests and block number tests are pinned to
  let swapParams: OneInchDataType;
  let swapAmountIn: BigNumber;
  let swapAmountOut: BigNumber;

  if (mockPayloadScenario && shouldUseMockPayloads) {
    const vaultName = (await token0.symbol()) + "/" + (await token1.symbol());
    if (
      mockPayloads[vaultName] &&
      mockPayloads[vaultName][mockPayloadScenario]
    ) {
      // console.log("using mock payload...");
      swapParams = {
        to: addresses.OneInchRouter,
        data: mockPayloads[vaultName][mockPayloadScenario].payload,
      };
      swapAmountIn = ethers.BigNumber.from(
        mockPayloads[vaultName][mockPayloadScenario].swapIn
      );
      swapAmountOut = ethers.BigNumber.from(
        mockPayloads[vaultName][mockPayloadScenario].swapOut
      );
    } else {
      return Promise.reject(
        "Mock payload of 1inch api not found for this scenario!"
      );
    }
  } else {
    // get quote and swap data from live 1inch API

    const chainID =
      network.name == "hardhat"
        ? "1"
        : network.config.chainId?.toString() ?? "1";

    // amount here is not so important, as what we want is an initial price for this asset pair
    const quoteAmount = await quote1Inch(
      chainID,
      zeroForOne ? token0.address : token1.address,
      zeroForOne ? token1.address : token0.address,
      zeroForOne ? amount0Max.toString() : amount1Max.toString()
    );

    const numerator = ethers.BigNumber.from(quoteAmount).mul(
      zeroForOne
        ? ethers.BigNumber.from((10 ** decimalsToken0).toString())
        : ethers.BigNumber.from((10 ** decimalsToken1).toString())
    );
    const denominator = zeroForOne
      ? amount0Max.mul(ethers.BigNumber.from((10 ** decimalsToken1).toString()))
      : amount1Max.mul(
          ethers.BigNumber.from((10 ** decimalsToken0).toString())
        );
    const priceX18 = numerator
      .mul(ethers.utils.parseEther("1"))
      .div(denominator);

    // given this price and the amounts the user is willing to spend
    // which token should be swapped and how much

    const result = await swapResolver.calculateSwapAmount(
      vault.address,
      amount0Max,
      amount1Max,
      priceX18
    );
    expect(result.zeroForOne).to.be.equals(zeroForOne);

    // now that we know how much to swap, let's get a new quote
    const quoteAmount2 = await quote1Inch(
      chainID,
      zeroForOne ? token0.address : token1.address,
      zeroForOne ? token1.address : token0.address,
      result.swapAmount.toString()
    );

    const numerator2 = ethers.BigNumber.from(quoteAmount2).mul(
      zeroForOne
        ? ethers.BigNumber.from((10 ** decimalsToken0).toString())
        : ethers.BigNumber.from((10 ** decimalsToken1).toString())
    );
    const denominator2 = result.swapAmount.mul(
      zeroForOne
        ? ethers.BigNumber.from((10 ** decimalsToken1).toString())
        : ethers.BigNumber.from((10 ** decimalsToken0).toString())
    );
    const price2 = numerator2
      .mul(ethers.utils.parseEther("1"))
      .div(denominator2);

    // given the new price, let's get a new swap amount
    const result2 = await swapResolver.calculateSwapAmount(
      vault.address,
      amount0Max,
      amount1Max,
      price2
    );
    expect(result2.zeroForOne).to.be.equals(zeroForOne);

    // given this new swapAmount, how much of the other token will I receive?
    const quoteAmount3 = await quote1Inch(
      chainID,
      zeroForOne ? token0.address : token1.address,
      zeroForOne ? token1.address : token0.address,
      result2.swapAmount.toString()
    );

    swapAmountIn = result2.swapAmount;
    swapAmountOut = ethers.BigNumber.from(quoteAmount3);

    swapParams = await swapTokenData(
      chainID,
      zeroForOne ? token0.address : token1.address,
      zeroForOne ? token1.address : token0.address,
      swapAmountIn.toString(),
      swapExecutor.address,
      slippage.toString()
    );

    // log these to store payload after
    console.log("swapAmountIn: ", swapAmountIn.toString());
    console.log("swapAmountOut: ", swapAmountOut.toString());
    console.log("swapParams: ", swapParams);
  }

  // calculate minimum amount out on the swap considering slippage passed
  const amountOut = swapAmountOut
    .mul(ethers.BigNumber.from((100 - slippage).toString()))
    .div(ethers.BigNumber.from((100).toString()));

  if (!rebalance) {
    rebalance = false;
  }

  // preparing parameter structs for swapAndAddLiquidity()
  const addData = {
    amount0Max: amount0Max,
    amount1Max: amount1Max,
    amount0Min: 0,
    amount1Min: 0,
    amountSharesMin: 0,
    vault: vault.address,
    receiver: signerAddress,
    gauge: stRakisToken ? stRakisToken.address : ethers.constants.AddressZero,
  };
  const swapData = {
    amountInSwap: swapAmountIn.toString(),
    amountOutSwap: amountOut,
    zeroForOne: zeroForOne,
    swapRouter: swapParams.to,
    swapPayload: swapParams.data,
  };
  const swapAndAddData = {
    addData: addData,
    swapData: swapData,
  };

  let hasSwapped = false; // flag indicating if "Swapped" event fired
  let hasMinted = false; // flag indicating if "Minted" event fired

  // object to be filled with "Swapped" event data
  const swapppedEventData = {
    zeroForOne: false,
    amount0Diff: ethers.BigNumber.from(0),
    amount1Diff: ethers.BigNumber.from(0),
    amountOutSwap: ethers.BigNumber.from(0),
  };

  // object to be filled with "Minted" event data
  const mintedEventData = {
    receiver: "",
    mintAmount: ethers.BigNumber.from(0),
    amount0In: ethers.BigNumber.from(0),
    amount1In: ethers.BigNumber.from(0),
    liquidityMinted: ethers.BigNumber.from(0),
  };

  // listener for getting data from "Swapped" event
  router.on(
    "Swapped",
    (
      zeroForOne: boolean,
      amount0Diff: BigNumber,
      amount1Diff: BigNumber,
      amountOutSwap: BigNumber
    ) => {
      swapppedEventData.zeroForOne = zeroForOne;
      swapppedEventData.amount0Diff = amount0Diff;
      swapppedEventData.amount1Diff = amount1Diff;
      swapppedEventData.amountOutSwap = amountOutSwap;
      hasSwapped = true;
    }
  );

  // listener for getting data from "Minted" event
  vault.on(
    "LogMint",
    (
      receiver: string,
      mintAmount: BigNumber,
      amount0In: BigNumber,
      amount1In: BigNumber
    ) => {
      mintedEventData.receiver = receiver;
      mintedEventData.mintAmount = ethers.BigNumber.from(mintAmount);
      mintedEventData.amount0In = ethers.BigNumber.from(amount0In);
      mintedEventData.amount1In = ethers.BigNumber.from(amount1In);
      hasMinted = true;
    }
  );

  // function that returns a promise that resolves when "Swapped" and "Minted" are fired
  const getEventsData = async () => {
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (hasSwapped && hasMinted) {
          clearInterval(interval);
          resolve();
        }
      }, 5000);
    });
  };

  let swapAndAddTxPending: ContractTransaction;

  // call swapAndAddLiquidity
  const balance0Before = await token0.balanceOf(signerAddress);
  const balance1Before = await token1.balanceOf(signerAddress);
  const balanceEthBefore = await token0.provider.getBalance(signerAddress);
  // if (useETH) {
  //   if (
  //     isToken0Weth &&
  //     swapAndAddData.addData.amount0Max.isZero() &&
  //     (transactionEthValue == null || transactionEthValue.isZero())
  //   ) {
  //     useETH = false;
  //   } else if (
  //     !isToken0Weth &&
  //     swapAndAddData.addData.amount1Max.isZero() &&
  //     (transactionEthValue == null || transactionEthValue.isZero())
  //   ) {
  //     useETH = false;
  //   }
  // }
  if (useETH) {
    if (isToken0Weth) {
      const value = transactionEthValue || swapAndAddData.addData.amount0Max;
      // console.log(value.toString(), swapAndAddData.addData.amount0Max.toString());
      if (value == swapAndAddData.addData.amount0Max) {
        swapAndAddTxPending = await router.swapAndAddLiquidity(swapAndAddData, {
          value: value,
        });
      } else {
        await token0.connect(signer).approve(router.address, 0);
        await expect(
          router.swapAndAddLiquidity(swapAndAddData, {
            value: value,
          })
        ).to.be.reverted;
        return;
      }
    } else {
      const value = transactionEthValue || swapAndAddData.addData.amount1Max;
      // console.log(value.toString(), swapAndAddData.addData.amount1Max.toString());
      if (value == swapAndAddData.addData.amount1Max) {
        swapAndAddTxPending = await router.swapAndAddLiquidity(swapAndAddData, {
          value: value,
        });
      } else {
        await token1.connect(signer).approve(router.address, 0);
        await expect(
          router.swapAndAddLiquidity(swapAndAddData, {
            value: value,
          })
        ).to.be.reverted;
        return;
      }
    }
  } else {
    if (transactionEthValue) {
      swapAndAddTxPending = await router.swapAndAddLiquidity(swapAndAddData, {
        value: transactionEthValue,
      });
    } else {
      swapAndAddTxPending = await router.swapAndAddLiquidity(swapAndAddData);
    }
  }

  // wait for tx
  const swapAndAddTx = await swapAndAddTxPending.wait();

  // calculate eth spent in tx
  const ethSpentForGas = swapAndAddTx.gasUsed.mul(
    swapAndAddTx.effectiveGasPrice
  );

  // wait for events to be fired so we have swap and deposit data
  await getEventsData();

  // get new balances
  const balance0After = await token0.balanceOf(signerAddress);
  const balance1After = await token1.balanceOf(signerAddress);
  const balanceEthAfter = await token0.provider.getBalance(signerAddress);
  const balanceRakisAfter = await rakisToken.balanceOf(signerAddress);
  const balanceStRakisAfter = stRakisToken
    ? await stRakisToken.balanceOf(signerAddress)
    : ethers.BigNumber.from(0);

  // calculate actual amounts used for mintAmounts after swap and validate swapAmountOut
  if (swapppedEventData.zeroForOne) {
    amount0Use = swapAndAddData.addData.amount0Max.sub(
      swapppedEventData.amount0Diff
    );
    amount1Use = swapAndAddData.addData.amount1Max.add(
      swapppedEventData.amount1Diff
    );

    expect(amountOut).to.be.lt(swapppedEventData.amount1Diff);
  } else {
    amount0Use = swapAndAddData.addData.amount0Max.add(
      swapppedEventData.amount0Diff
    );
    amount1Use = swapAndAddData.addData.amount1Max.sub(
      swapppedEventData.amount1Diff
    );

    expect(amountOut).to.be.lt(swapppedEventData.amount0Diff);
  }

  // calculate expected refunds
  const refund0 = amount0Use.sub(mintedEventData.amount0In);
  const refund1 = amount1Use.sub(mintedEventData.amount1In);

  // validate balances
  if (!useETH) {
    expect(balance0After).to.equal(
      balance0Before.sub(swapAndAddData.addData.amount0Max).add(refund0)
    );
    expect(balance1After).to.equal(
      balance1Before.sub(swapAndAddData.addData.amount1Max).add(refund1)
    );
    expect(balanceEthAfter).to.equal(balanceEthBefore.sub(ethSpentForGas));
  } else {
    if (isToken0Weth) {
      expect(balance0After).to.equal(balance0Before);
      expect(balance1After).to.equal(
        balance1Before.sub(swapAndAddData.addData.amount1Max).add(refund1)
      );
      expect(balanceEthAfter).to.equal(
        balanceEthBefore
          .sub(swapAndAddData.addData.amount0Max)
          .sub(ethSpentForGas)
          .add(refund0)
      );
    } else {
      expect(balance0After).to.equal(
        balance0Before.sub(swapAndAddData.addData.amount0Max).add(refund0)
      );
      expect(balance1After).to.equal(balance1Before);
      expect(balanceEthAfter).to.equal(
        balanceEthBefore
          .sub(swapAndAddData.addData.amount1Max)
          .sub(ethSpentForGas)
          .add(refund1)
      );
    }
  }

  // validate staked token balances
  if (stRakisToken) {
    expect(balanceRakisBefore).to.be.eq(balanceRakisAfter);
    expect(balanceStRakisBefore).to.be.lt(balanceStRakisAfter);
  } else {
    expect(balanceRakisBefore).to.be.lt(balanceRakisAfter);
    expect(balanceStRakisBefore).to.be.eq(balanceStRakisAfter);
  }

  // validate router balances
  const swapperBalance0 = await token0.balanceOf(swapExecutor.address);
  const swapperBalance1 = await token1.balanceOf(swapExecutor.address);
  const swapperBalanceRakis = await rakisToken.balanceOf(swapExecutor.address);
  expect(swapperBalance0).to.equal(ethers.constants.Zero);
  expect(swapperBalance1).to.equal(ethers.constants.Zero);
  expect(swapperBalanceRakis).to.equal(ethers.constants.Zero);
  if (stRakisToken) {
    const routerBalanceStRakis = await stRakisToken.balanceOf(
      swapExecutor.address
    );
    expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
  }

  // validate router - 1inch allowance
  const swapExecutorAllowance0 = await token0.allowance(
    swapExecutor.address,
    addresses.OneInchRouter
  );
  const swapExecutorAllowance1 = await token1.allowance(
    swapExecutor.address,
    addresses.OneInchRouter
  );
  expect(swapExecutorAllowance0).to.equal(ethers.constants.Zero);
  expect(swapExecutorAllowance1).to.equal(ethers.constants.Zero);

  // validate generic router balances
  const routerBalance0 = await token0.balanceOf(router.address);
  const routerBalance1 = await token1.balanceOf(router.address);
  const routerBalanceRakis = await rakisToken.balanceOf(router.address);
  expect(routerBalance0).to.equal(ethers.constants.Zero);
  expect(routerBalance1).to.equal(ethers.constants.Zero);
  expect(routerBalanceRakis).to.equal(ethers.constants.Zero);
  if (stRakisToken) {
    const routerBalanceStRakis = await stRakisToken.balanceOf(router.address);
    expect(routerBalanceStRakis).to.equal(ethers.constants.Zero);
  }
  const routerBalETH = await signer.provider?.getBalance(router.address);
  expect(routerBalETH).to.equal(ethers.constants.Zero);

  // validate we cannot mint with amounts refunded
  await expect(
    resolver.getMintAmounts(vault.address, refund0, refund1)
  ).to.be.revertedWith("ArrakisVaultV2: mint 0");
};
