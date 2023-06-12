// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {
    PositionLiquidity
} from "@arrakisfi/v2-core/contracts/structs/SArrakisV2.sol";
import {StaticVaultInfo} from "./SStaticManager.sol";

struct InitializeStatic {
    PositionLiquidity[] positions;
    uint24[] feeTiers;
    address token0;
    address token1;
    address receiver;
    uint256 minDeposit0;
    uint256 minDeposit1;
    uint256 maxDeposit0;
    uint256 maxDeposit1;
    StaticVaultInfo vaultInfo;
    address rewardToken;
    address rewardDistributor;
}
