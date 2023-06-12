// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

struct StaticVaultInfo {
    int24 twapDeviation;
    uint24 twapDuration;
    bool compoundEnabled;
}

struct SetStaticVault {
    address vault;
    StaticVaultInfo vaultInfo;
}
