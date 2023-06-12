// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import "forge-std/Test.sol";
import "forge-std/Vm.sol";

contract TestWrapper is Test {
    constructor() {
        vm.createSelectFork(
            vm.envString("ETH_RPC_URL"),
            vm.envUint("BLOCK_NUMBER")
        );
    }
}
