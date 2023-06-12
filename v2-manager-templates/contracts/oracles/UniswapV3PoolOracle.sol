// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {IOracleWrapper} from "../interfaces/IOracleWrapper.sol";
import {IUniswapV3Pool, Twap} from "../libraries/Twap.sol";

/// @title Twap Oracle wrapper
contract UniswapV3PoolOracle is IOracleWrapper {
    // #region immutable variable.

    IUniswapV3Pool public immutable pool;
    uint24 public immutable twapDuration;

    // #endregion immutable variable.

    constructor(IUniswapV3Pool pool_, uint24 twapDuration_) {
        require(address(pool_) != address(0), "ZA");
        require(twapDuration_ <= 3600, "T");
        pool = pool_;
        twapDuration = twapDuration_;
    }

    /// @notice get Price of token 1 over token 0
    /// @return price0
    function getPrice0() external view override returns (uint256 price0) {
        return Twap.getPrice0(pool, twapDuration);
    }

    /// @notice get Price of token 0 over token 1
    /// @return price1
    function getPrice1() external view override returns (uint256 price1) {
        return Twap.getPrice1(pool, twapDuration);
    }
}
