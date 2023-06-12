// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    PositionLiquidity,
    Rebalance,
    UnderlyingOutput
} from "@arrakisfi/v2-core/contracts/structs/SArrakisV2.sol";
import {FullMath, IUniswapV3Pool, Twap} from "./libraries/Twap.sol";
import {
    ArrakisV2StaticManagerStorage
} from "./abstract/ArrakisV2StaticManagerStorage.sol";
import {SetStaticVault, StaticVaultInfo} from "./structs/SStaticManager.sol";
import {
    hundredPercent
} from "@arrakisfi/v2-core/contracts/constants/CArrakisV2.sol";

contract ArrakisV2StaticManager is ArrakisV2StaticManagerStorage {
    using SafeERC20 for IERC20;

    constructor(address helper_, uint16 managerFeeBPS_)
        ArrakisV2StaticManagerStorage(helper_, managerFeeBPS_)
    {} // solhint-disable-line no-empty-blocks

    function setStaticVault(SetStaticVault calldata params_)
        external
        onlyDeployer
    {
        if (params_.vaultInfo.compoundEnabled) {
            // must have non-zero deviation and duration
            require(
                params_.vaultInfo.twapDeviation > 0 &&
                    params_.vaultInfo.twapDuration > 0,
                "DN"
            );
        }
        // only vault owner can call
        require(msg.sender == IArrakisV2(params_.vault).owner(), "NO");
        // must be manager
        require(address(this) == IArrakisV2(params_.vault).manager(), "NM");
        // set fee take rate
        IArrakisV2(params_.vault).setManagerFeeBPS(managerFeeBPS);

        // add vault
        vaults[params_.vault] = params_.vaultInfo;
    }

    // solhint-disable-next-line function-max-lines
    function compoundFees(IArrakisV2 vault_) external whenNotPaused {
        StaticVaultInfo memory vaultInfo = vaults[address(vault_)];
        require(vaultInfo.compoundEnabled, "cannot rebalance");

        // check TWAPs for manipulation
        _checkTWAPs(vault_, vaultInfo.twapDuration, vaultInfo.twapDeviation);

        // get underlying information
        UnderlyingOutput memory underlying = helper
            .totalUnderlyingWithFeesAndLeftOver(vault_);

        require(
            underlying.amount0 > 0 || underlying.amount1 > 0,
            "vault empty"
        );

        uint16 managerBPS = vault_.managerFeeBPS();

        uint256 fixedFee0 = FullMath.mulDiv(
            underlying.fee0,
            hundredPercent - managerBPS,
            hundredPercent
        );

        uint256 fixedFee1 = FullMath.mulDiv(
            underlying.fee1,
            hundredPercent - managerBPS,
            hundredPercent
        );

        // compute growth factor
        uint256 liquidity0 = underlying.amount0 -
            (underlying.leftOver0 + fixedFee0);
        uint256 liquidity1 = underlying.amount1 -
            (underlying.leftOver1 + fixedFee1);
        uint256 proportion0 = liquidity0 > 0
            ? FullMath.mulDiv(
                underlying.leftOver0 + fixedFee0,
                hundredPercent,
                liquidity0
            )
            : type(uint256).max;
        uint256 proportion1 = liquidity1 > 0
            ? FullMath.mulDiv(
                underlying.leftOver1 + fixedFee1,
                hundredPercent,
                liquidity1
            )
            : type(uint256).max;
        uint256 growthFactor = proportion0 < proportion1
            ? proportion0
            : proportion1;

        require(growthFactor > 0, "nothing to reinvest");

        PositionLiquidity[] memory positions = helper.totalLiquidity(vault_);

        // compute maximal proportional liquidity increase
        PositionLiquidity[] memory newPositions = new PositionLiquidity[](
            positions.length
        );
        for (uint256 i; i < positions.length; i++) {
            uint256 growLiquidity = FullMath.mulDiv(
                positions[i].liquidity,
                growthFactor,
                hundredPercent
            );
            require(growLiquidity < 2**128, "overflow uint128");

            uint128 amount = positions[i].liquidity + uint128(growLiquidity);
            newPositions[i] = PositionLiquidity({
                liquidity: amount,
                range: positions[i].range
            });
        }

        // rebalance
        Rebalance memory rebalance;
        rebalance.burns = positions;
        rebalance.mints = newPositions;
        vault_.rebalance(rebalance);

        emit Compound(address(vault_), msg.sender, growthFactor);
    }

    // solhint-disable-next-line code-complexity
    function withdrawAndCollectFees(
        IArrakisV2[] calldata vaults_,
        IERC20[] calldata tokens_,
        address target
    ) external onlyOwner {
        require(vaults_.length > 0, "ZV");
        require(target != address(0), "TZA");

        // #region withdraw from vaults.

        for (uint256 i; i < vaults_.length; i++) {
            require(vaults_[i].manager() == address(this), "NM");

            vaults_[i].withdrawManagerBalance();
        }

        // #endregion withdraw from vaults.

        // #region transfer token to target.

        for (uint256 i; i < tokens_.length; i++) {
            uint256 balance = IERC20(tokens_[i]).balanceOf(address(this));
            if (balance > 0) IERC20(tokens_[i]).safeTransfer(target, balance);
        }

        // #endregion transfer token to target.
    }

    function _checkTWAPs(
        IArrakisV2 vault_,
        uint24 twapDuration,
        int24 twapDeviation
    ) internal view {
        address[] memory pools = vault_.getPools();
        for (uint256 i; i < pools.length; i++) {
            Twap.checkDeviation(
                IUniswapV3Pool(pools[i]),
                twapDuration,
                twapDeviation
            );
        }
    }
}
