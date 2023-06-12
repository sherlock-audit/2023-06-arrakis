// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

import {SetStaticVault} from "../structs/SStaticManager.sol";

interface IArrakisV2StaticManager {
    function setStaticVault(SetStaticVault calldata params) external;

    function managerFeeBPS() external view returns (uint16);
}
