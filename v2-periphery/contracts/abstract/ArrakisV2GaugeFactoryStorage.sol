// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    IArrakisV2Beacon
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Beacon.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @title Arrakis Factory Storage Smart Contract
// solhint-disable-next-line max-states-count
abstract contract ArrakisV2GaugeFactoryStorage is OwnableUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;

    IArrakisV2Beacon public immutable arrakisGaugeBeacon;
    EnumerableSet.AddressSet internal _gauges;
    address public defaultRewardToken;
    address public ve;
    address public veBoost;

    event InitFactory(address owner);
    event GaugeCreated(address deployer, address gauge);
    event DefaultRewardSet(address token, address ve, address veBoost);

    // #region constructor.

    constructor(address gaugeBeacon_) {
        require(gaugeBeacon_ != address(0), "Z");
        arrakisGaugeBeacon = IArrakisV2Beacon(gaugeBeacon_);
    }

    // #endregion constructor.

    function initialize(
        address owner_,
        address rewardToken_,
        address ve_,
        address veBoost_
    ) external initializer {
        require(
            owner_ != address(0) &&
                rewardToken_ != address(0) &&
                ve_ != address(0) &&
                veBoost_ != address(0),
            "address zero"
        );
        _transferOwnership(owner_);
        defaultRewardToken = rewardToken_;
        ve = ve_;
        veBoost = veBoost_;
        emit DefaultRewardSet(rewardToken_, ve_, veBoost_);
        emit InitFactory(owner_);
    }

    function setDefaultReward(
        address rewardToken_,
        address ve_,
        address veBoost_
    ) external onlyOwner {
        require(
            rewardToken_ != address(0) &&
                ve_ != address(0) &&
                veBoost_ != address(0),
            "address zero"
        );
        defaultRewardToken = rewardToken_;
        ve = ve_;
        veBoost = veBoost_;
        emit DefaultRewardSet(rewardToken_, ve_, veBoost_);
    }

    // #endregion admin set functions

    // #region admin view call.

    /// @notice get gauge instance admin
    /// @param proxy instance of Arrakis V2.
    /// @return admin address of Arrakis V2 instance admin.
    function getProxyAdmin(address proxy) external view returns (address) {
        // We need to manually run the static call since the getter cannot be flagged as view
        // bytes4(keccak256("admin()")) == 0xf851a440
        (bool success, bytes memory returndata) = proxy.staticcall(
            hex"f851a440"
        );
        require(success, "PA");
        return abi.decode(returndata, (address));
    }

    /// @notice get gauge implementation
    /// @param proxy instance of Arrakis V2.
    /// @return implementation address of Arrakis V2 implementation.
    function getProxyImplementation(address proxy)
        external
        view
        returns (address)
    {
        // We need to manually run the static call since the getter cannot be flagged as view
        // bytes4(keccak256("implementation()")) == 0x5c60da1b
        (bool success, bytes memory returndata) = proxy.staticcall(
            hex"5c60da1b"
        );
        require(success, "PI");
        return abi.decode(returndata, (address));
    }

    // #endregion admin view call.
}
