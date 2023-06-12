// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    IArrakisV2Helper
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Helper.sol";
import {StaticVaultInfo} from "../structs/SStaticManager.sol";
import {
    hundredPercent
} from "@arrakisfi/v2-core/contracts/constants/CArrakisV2.sol";

abstract contract ArrakisV2StaticManagerStorage is
    OwnableUpgradeable,
    PausableUpgradeable
{
    IArrakisV2Helper public immutable helper;
    uint16 public immutable managerFeeBPS;

    address public deployer;
    mapping(address => StaticVaultInfo) public vaults;

    event Compound(address vault, address caller, uint256 growthBPS);

    modifier onlyDeployer() {
        require(msg.sender == deployer, "only deployer");
        _;
    }

    constructor(address helper_, uint16 managerFeeBPS_) {
        require(helper_ != address(0), "Z");
        helper = IArrakisV2Helper(helper_);
        require(managerFeeBPS_ <= hundredPercent, "bps");
        managerFeeBPS = managerFeeBPS_;
    }

    function initialize(address owner_) external initializer {
        require(owner_ != address(0), "Z");
        __Pausable_init();
        _transferOwnership(owner_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setDeployer(address deployer_) external onlyOwner {
        deployer = deployer_;
    }
}
