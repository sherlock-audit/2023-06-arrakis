// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {TickMath} from "@arrakisfi/v3-lib-0.8/contracts/TickMath.sol";
import {FullMath} from "@arrakisfi/v3-lib-0.8/contracts/FullMath.sol";
import {IDecimals} from "../interfaces/IDecimals.sol";

library Twap {
    /// @dev Fetches time-weighted average price in ticks from Uniswap pool.
    function getTwap(
        IUniswapV3Pool pool_,
        uint24 twapDuration_
    ) internal view returns (int24) {
        uint32[] memory secondsAgo = new uint32[](2);
        secondsAgo[0] = twapDuration_;
        secondsAgo[1] = 0;

        (int56[] memory tickCumulatives, ) = pool_.observe(secondsAgo);
        return
            int24(
                (tickCumulatives[1] - tickCumulatives[0]) /
                    int56(uint56(twapDuration_))
            );
    }

    function getSqrtTwapX96(
        IUniswapV3Pool pool_,
        uint24 twapDuration_
    ) internal view returns (uint160 sqrtPriceX96) {
        if (twapDuration_ == 0) {
            // return the current price if twapInterval == 0
            (sqrtPriceX96, , , , , , ) = pool_.slot0();
        } else {
            // tick(imprecise as it's an integer) to price
            sqrtPriceX96 = TickMath.getSqrtRatioAtTick(
                getTwap(pool_, twapDuration_)
            );
        }
    }

    function getPrice0(
        IUniswapV3Pool pool_,
        uint24 twapDuration_
    ) internal view returns (uint256 price0) {
        IDecimals token0 = IDecimals(pool_.token0());

        uint256 priceX96 = getSqrtTwapX96(pool_, twapDuration_);

        if (priceX96 <= type(uint128).max) {
            price0 = FullMath.mulDiv(
                priceX96 * priceX96,
                10 ** token0.decimals(),
                2 ** 192
            );
        } else {
            price0 = FullMath.mulDiv(
                FullMath.mulDiv(priceX96, priceX96, 1 << 64),
                10 ** token0.decimals(),
                1 << 128
            );
        }
    }

    function getPrice1(
        IUniswapV3Pool pool_,
        uint24 twapDuration_
    ) internal view returns (uint256 price1) {
        IDecimals token1 = IDecimals(pool_.token1());

        uint256 priceX96 = getSqrtTwapX96(pool_, twapDuration_);

        if (priceX96 <= type(uint128).max) {
            price1 = FullMath.mulDiv(
                2 ** 192,
                10 ** token1.decimals(),
                priceX96 * priceX96
            );
        } else {
            price1 = FullMath.mulDiv(
                1 << 128,
                10 ** token1.decimals(),
                FullMath.mulDiv(priceX96, priceX96, 1 << 64)
            );
        }
    }
}
