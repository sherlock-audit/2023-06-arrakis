// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    LiquidityAmounts
} from "@arrakisfi/v3-lib-0.8/contracts/LiquidityAmounts.sol";
import {TickMath} from "@arrakisfi/v3-lib-0.8/contracts/TickMath.sol";
import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {
    IUniswapV3Factory
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {
    IArrakisV2
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {
    IArrakisV2Resolver
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Resolver.sol";
import {
    IArrakisV2Factory
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Factory.sol";
import {IArrakisV2GaugeFactory} from "./interfaces/IArrakisV2GaugeFactory.sol";
import {
    IArrakisV2StaticManager
} from "./interfaces/IArrakisV2StaticManager.sol";
import {
    PositionLiquidity,
    InitializePayload,
    Rebalance
} from "@arrakisfi/v2-core/contracts/structs/SArrakisV2.sol";
import {InitializeStatic} from "./structs/SArrakisV2StaticDeployer.sol";
import {SetStaticVault} from "./structs/SStaticManager.sol";

contract ArrakisV2StaticDeployer {
    using SafeERC20 for IERC20;

    IUniswapV3Factory public immutable uniswapFactory;
    IArrakisV2Factory public immutable arrakisFactory;
    IArrakisV2GaugeFactory public immutable gaugeFactory;
    IArrakisV2StaticManager public immutable staticManager;
    IArrakisV2Resolver public immutable resolver;

    event CreateStaticVault(
        address vault,
        address gauge,
        address caller,
        uint256 amount0,
        uint256 amount1
    );

    constructor(
        address uniswapFactory_,
        address arrakisFactory_,
        address gaugeFactory_,
        address staticManager_,
        address resolver_
    ) {
        require(
            uniswapFactory_ != address(0) &&
                arrakisFactory_ != address(0) &&
                gaugeFactory_ != address(0) &&
                staticManager_ != address(0) &&
                resolver_ != address(0),
            "Z"
        );
        uniswapFactory = IUniswapV3Factory(uniswapFactory_);
        arrakisFactory = IArrakisV2Factory(arrakisFactory_);
        gaugeFactory = IArrakisV2GaugeFactory(gaugeFactory_);
        staticManager = IArrakisV2StaticManager(staticManager_);
        resolver = IArrakisV2Resolver(resolver_);
    }

    // solhint-disable-next-line function-max-lines
    function deployStaticVault(InitializeStatic calldata params_)
        external
        returns (address vault, address gauge)
    {
        (uint256 init0, uint256 init1) = _getInits(
            params_.positions,
            params_.token0,
            params_.token1
        );

        require(
            init0 >= params_.minDeposit0 &&
                init1 >= params_.minDeposit1 &&
                init0 <= params_.maxDeposit0 &&
                init1 <= params_.maxDeposit1,
            "slippage"
        );

        vault = arrakisFactory.deployVault(
            InitializePayload({
                feeTiers: params_.feeTiers,
                token0: params_.token0,
                token1: params_.token1,
                owner: address(this),
                init0: init0,
                init1: init1,
                manager: address(this),
                routers: new address[](0)
            }),
            true
        );

        IERC20(params_.token0).safeApprove(vault, init0);
        IERC20(params_.token1).safeApprove(vault, init1);

        if (init0 > 0)
            IERC20(params_.token0).safeTransferFrom(
                msg.sender,
                address(this),
                init0
            );
        if (init1 > 0)
            IERC20(params_.token1).safeTransferFrom(
                msg.sender,
                address(this),
                init1
            );

        IArrakisV2(vault).mint(1 ether, params_.receiver);

        Rebalance memory rebalance;
        rebalance.mints = params_.positions;

        IArrakisV2(vault).rebalance(rebalance);

        IArrakisV2(vault).setManager(address(staticManager));

        staticManager.setStaticVault(
            SetStaticVault({vault: vault, vaultInfo: params_.vaultInfo})
        );

        if (params_.rewardToken != address(0)) {
            gauge = gaugeFactory.deployGauge(
                vault,
                params_.rewardToken,
                params_.rewardDistributor
            );
        }

        IArrakisV2(vault).renounceOwnership();

        emit CreateStaticVault(vault, gauge, msg.sender, init0, init1);
    }

    function managerFeeBPS() external view returns (uint16) {
        return staticManager.managerFeeBPS();
    }

    function _getInits(
        PositionLiquidity[] memory positions_,
        address token0_,
        address token1_
    ) internal view returns (uint256 init0, uint256 init1) {
        for (uint256 i; i < positions_.length; i++) {
            address pool = uniswapFactory.getPool(
                token0_,
                token1_,
                positions_[i].range.feeTier
            );
            (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
            /// @dev casting uint128 -> int128 is only safe in the lower half
            require(
                positions_[i].liquidity <= type(uint128).max / 2,
                "overflow"
            );
            (uint256 in0, uint256 in1) = resolver.getAmountsForLiquidity(
                sqrtPriceX96,
                positions_[i].range.lowerTick,
                positions_[i].range.upperTick,
                int128(positions_[i].liquidity)
            );
            init0 += in0;
            init1 += in1;
        }
    }
}
