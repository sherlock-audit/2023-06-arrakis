// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    ArrakisV2Beacon
} from "@arrakisfi/v2-core/contracts/ArrakisV2Beacon.sol";

contract ArrakisV2GaugeBeacon is ArrakisV2Beacon {
    constructor(address implementation_, address owner_)
        ArrakisV2Beacon(implementation_, owner_)
    {} // solhint-disable-line no-empty-blocks
}
