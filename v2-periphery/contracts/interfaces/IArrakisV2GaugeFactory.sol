// SPDX-License-Identifier: UNLICENSED
// solhint-disable-next-line compiler-version
pragma solidity >=0.8.0;

interface IArrakisV2GaugeFactory {
    function deployGauge(
        address,
        address,
        address
    ) external returns (address);
}
