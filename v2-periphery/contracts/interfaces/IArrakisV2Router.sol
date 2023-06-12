// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";

import {
    AddLiquidityData,
    AddLiquidityPermit2Data,
    RemoveLiquidityData,
    RemoveLiquidityPermit2Data,
    SwapAndAddData,
    SwapAndAddPermit2Data
} from "../structs/SArrakisV2Router.sol";

interface IArrakisV2Router {
    function addLiquidity(AddLiquidityData memory params_)
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 sharesReceived
        );

    function removeLiquidity(RemoveLiquidityData memory params_)
        external
        returns (uint256 amount0, uint256 amount1);

    function swapAndAddLiquidity(SwapAndAddData memory params_)
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 sharesReceived,
            uint256 amount0Diff,
            uint256 amount1Diff
        );

    function addLiquidityPermit2(AddLiquidityPermit2Data memory params_)
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 sharesReceived
        );

    function removeLiquidityPermit2(RemoveLiquidityPermit2Data memory params_)
        external
        returns (uint256 amount0, uint256 amount1);

    function swapAndAddLiquidityPermit2(SwapAndAddPermit2Data memory params_)
        external
        payable
        returns (
            uint256 amount0,
            uint256 amount1,
            uint256 sharesReceived,
            uint256 amount0Diff,
            uint256 amount1Diff
        );

    function updateSwapExecutor(address swapper_) external;

    function whitelist(address vault_, address[] memory toWhitelist_) external;

    function blacklist(address vault_, address[] memory toBlacklist_) external;

    function setMintRules(
        address vault_,
        uint256 supplyCap_,
        bool hasWhitelist_
    ) external;

    function getWhitelist(address vault_)
        external
        view
        returns (address[] memory);
}
