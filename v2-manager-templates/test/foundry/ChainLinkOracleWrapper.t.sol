// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import "../utils/TestWrapper.sol";
import "forge-std/Vm.sol";
import {SimpleManager, IArrakisV2, FullMath} from "contracts/SimpleManager.sol";
import {IOracleWrapper} from "contracts/interfaces/IOracleWrapper.sol";
import {
    ChainLinkOracle,
    AggregatorV3Interface
} from "contracts/oracles/ChainLinkOracle.sol";
import {
    IUniswapV3Factory
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {
    ProxyAdmin
} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {
    IArrakisV2Factory,
    InitializePayload
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Factory.sol";
import {
    ISwapRouter
} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {
    Rebalance,
    RangeWeight,
    Range,
    SwapPayload
} from "@arrakisfi/v2-core/contracts/structs/SArrakisV2.sol";
import {Twap, TickMath} from "contracts/libraries/Twap.sol";
import {
    IArrakisV2Resolver
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2Resolver.sol";
import {IArrakisV2SetManager} from "../interfaces/IArrakisV2SetManager.sol";
import {IArrakisV2SetInits} from "../interfaces/IArrakisV2SetInits.sol";
import {
    IArrakisV2GetRestrictedMint
} from "../interfaces/IArrakisV2GetRestrictedMint.sol";
import {IArrakisV2GetOwner} from "../interfaces/IArrakisV2GetOwner.sol";
import {
    binanceUSDCHotWallet,
    binanceUSDTHotWallet,
    aaveWETHPool,
    aaveAAVEPool,
    aaveWMATICPool
} from "../constants/Wallets.sol";
import {usdc, weth, usdt, wmatic, aave} from "../constants/Tokens.sol";
import {
    arrakisV2Factory,
    arrakisV2Resolver,
    uniFactory,
    swapRouter,
    vm
} from "../constants/ContractsInstances.sol";
import {hundred_percent} from "contracts/constants/CSimpleManager.sol";

// solhint-disable-next-line max-states-count
contract ChainLinkOracleWrapperTest is TestWrapper {
    using stdStorage for StdStorage;

    uint16 public constant MANAGER_FEE_BPS = 100;

    uint256 public amountOfToken0;
    uint256 public amountOfToken1;

    SimpleManager public simpleManager;
    IUniswapV3Factory public uniswapV3Factory;
    IArrakisV2Resolver public resolver;
    IOracleWrapper public oracle;
    address public vault;
    int24 public lowerTick;
    int24 public upperTick;
    int24 public tickSpacing;
    uint24 public feeTier;
    address[] public operators;

    constructor() {
        SimpleManager impl = new SimpleManager(IUniswapV3Factory(uniFactory));

        ProxyAdmin admin = new ProxyAdmin();

        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            address(impl),
            address(admin),
            ""
        );

        simpleManager = SimpleManager(address(proxy));

        simpleManager.initialize(address(this));
    }

    function setUp() public {
        operators = new address[](1);
        operators[0] = address(this);
    }

    // #region test rebalance USDC / WETH.

    // solhint-disable-next-line function-max-lines
    function testSingleRangeNoSwapRebalanceUSDCWETH() public {
        _setupUSDCWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokensUSDCWETH();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0, amountOfToken1);

        vm.prank(msg.sender);
        usdc.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // get rebalance payload.
        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testMultipleRangeNoSwapRebalanceUSDCWETH() public {
        _setupUSDCWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokensUSDCWETH();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0, amountOfToken1);

        vm.prank(msg.sender);
        usdc.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // get rebalance payload.
        Range memory range0 = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        Range memory range1 = Range({
            lowerTick: lowerTick - tickSpacing,
            upperTick: lowerTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](2);
        rangeWeights[0] = RangeWeight({weight: 5000, range: range0});
        rangeWeights[1] = RangeWeight({weight: 5000, range: range1});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceShouldRevertWithS0USDCWETH() public {
        _setupUSDCWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getUSDCTokens();

        uint256 slot = stdstore.target(vault).sig("init1()").find();

        uint256 init1 = 0;
        vm.store(vault, bytes32(slot), bytes32(init1));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0 * 2, 0);

        vm.prank(msg.sender);
        usdc.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice0(),
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken0,
            10 ** ERC20(address(usdc)).decimals()
        );

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken0,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: true,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(usdc),
                    tokenOut: address(weth),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken0,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        vm.expectRevert(bytes("S0"));

        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceUSDCWETH() public {
        _setupUSDCWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getUSDCTokens();

        uint256 slot = stdstore.target(vault).sig("init1()").find();

        uint256 init1 = 0;
        vm.store(vault, bytes32(slot), bytes32(init1));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0 * 2, 0);

        vm.prank(msg.sender);
        usdc.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = (FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice0(), // oracle is inversed
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken0,
            10 ** ERC20(address(usdc)).decimals()
        ) * 10050) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken0,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: true,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(usdc),
                    tokenOut: address(weth),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken0,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceWETUSDCWETH() public {
        _setupUSDCWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getWETHTokens();

        uint256 slot = stdstore.target(vault).sig("init0()").find();

        uint256 init0 = 0;
        vm.store(vault, bytes32(slot), bytes32(init0));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, 0, amountOfToken1 * 2);

        vm.prank(msg.sender);
        usdc.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = (FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice1(), // oracle is inversed.
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken1,
            10 ** ERC20(address(weth)).decimals()
        ) * 10050) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken1,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: false,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(weth),
                    tokenOut: address(usdc),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken1,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function _setupUSDCWETH() internal {
        amountOfToken0 = 100000e6;
        amountOfToken1 = 100e18;

        // #region create Vault

        feeTier = 500;
        /* solhint-disable reentrancy */
        (uint256 amount0, uint256 amount1) = _getAmountsForLiquidity(
            usdc,
            weth,
            feeTier
        );

        uint24[] memory feeTiers = new uint24[](1);
        feeTiers[0] = feeTier;

        address[] memory routers = new address[](1);
        routers[0] = swapRouter;

        vault = IArrakisV2Factory(arrakisV2Factory).deployVault(
            InitializePayload({
                feeTiers: feeTiers,
                token0: address(usdc),
                token1: address(weth),
                owner: msg.sender,
                init0: amount0,
                init1: amount1,
                manager: address(simpleManager),
                routers: routers
            }),
            true
        );

        // #endregion create Vault

        /* solhint-enable reentrancy */

        uint8 token0Decimals = ERC20(address(usdc)).decimals();
        uint8 token1Decimals = ERC20(address(weth)).decimals();
        address priceFeed = 0xefb7e6be8356cCc6827799B6A7348eE674A80EaE;

        // #region create Oracle.

        oracle = new ChainLinkOracle(
            token0Decimals,
            token1Decimals,
            priceFeed,
            address(0),
            86400,
            false
        );

        // #endregion create Oracle.
    }

    // #endregion test rebalance USDC / WETH.

    // #region test rebalance USDT / WETH.

    // solhint-disable-next-line function-max-lines
    function testSingleRangeNoSwapRebalanceUSDTWETH() public {
        _setupUSDTWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokensUSDTWETH();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0, amountOfToken1);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        usdt.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // get rebalance payload.
        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testMultipleRangeNoSwapRebalanceUSDTWETH() public {
        _setupUSDTWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokensUSDTWETH();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0, amountOfToken1);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        usdt.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // get rebalance payload.
        Range memory range0 = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        Range memory range1 = Range({
            lowerTick: lowerTick - tickSpacing,
            upperTick: lowerTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](2);
        rangeWeights[0] = RangeWeight({weight: 5000, range: range0});
        rangeWeights[1] = RangeWeight({weight: 5000, range: range1});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceShouldRevertWithS0USDTWETH() public {
        _setupUSDTWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getUSDTTokens();

        uint256 slot = stdstore.target(vault).sig("init0()").find();

        uint256 init0 = 0;
        vm.store(vault, bytes32(slot), bytes32(init0));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, 0, amountOfToken1 * 2);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        usdt.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice0(),
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken0,
            10 ** ERC20(address(weth)).decimals()
        );

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken0,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: true,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(weth),
                    tokenOut: address(usdt),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken0,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        vm.expectRevert(bytes("S0"));

        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceWETHUSDTWETH() public {
        _setupUSDTWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getUSDTTokens();

        uint256 slot = stdstore.target(vault).sig("init0()").find();

        uint256 init0 = 0;
        vm.store(vault, bytes32(slot), bytes32(init0));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, 0, amountOfToken1 * 2);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        usdt.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = (FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice1(), // oracle is inversed
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken1,
            10 ** ERC20(address(usdt)).decimals()
        ) * 10050) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken1,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: false,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(usdt),
                    tokenOut: address(weth),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken1,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceUSDTWETH() public {
        _setupUSDTWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getWETHTokensAsToken0();

        uint256 slot = stdstore.target(vault).sig("init1()").find();

        uint256 init1 = 0;
        vm.store(vault, bytes32(slot), bytes32(init1));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0 * 2, 0);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        usdt.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = (FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice0(), // oracle is inversed.
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken0,
            10 ** ERC20(address(weth)).decimals()
        ) * 10010) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken0,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: true,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(weth),
                    tokenOut: address(usdt),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken0,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function _setupUSDTWETH() internal {
        amountOfToken0 = 1e18;
        amountOfToken1 = 1000e6;

        // #region create Vault

        feeTier = 3000;
        /* solhint-disable reentrancy */
        (uint256 amount0, uint256 amount1) = _getAmountsForLiquidity(
            weth,
            usdt,
            feeTier
        );

        uint24[] memory feeTiers = new uint24[](1);
        feeTiers[0] = feeTier;

        address[] memory routers = new address[](1);
        routers[0] = swapRouter;

        vault = IArrakisV2Factory(arrakisV2Factory).deployVault(
            InitializePayload({
                feeTiers: feeTiers,
                token0: address(weth),
                token1: address(usdt),
                owner: msg.sender,
                init0: amount0,
                init1: amount1,
                manager: address(simpleManager),
                routers: routers
            }),
            true
        );

        // #endregion create Vault

        /* solhint-enable reentrancy */

        uint8 token0Decimals = ERC20(address(weth)).decimals();
        uint8 token1Decimals = ERC20(address(usdt)).decimals();
        address priceFeed = 0xf9d5AAC6E5572AEFa6bd64108ff86a222F69B64d;

        // #region create Oracle.

        oracle = new ChainLinkOracle(
            token0Decimals,
            token1Decimals,
            priceFeed,
            address(0),
            86400,
            true
        );

        // #endregion create Oracle.
    }

    // #endregion test rebalance USDT / WETH.

    // #region test rebalance AAVE / WETH.

    // solhint-disable-next-line function-max-lines
    function testSingleRangeNoSwapRebalanceAAVEWETH() public {
        _setupAAVEWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokensAAVEWETH();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0, amountOfToken1);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        aave.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // get rebalance payload.
        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testMultipleRangeNoSwapRebalanceAAVEWETH() public {
        _setupAAVEWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokensAAVEWETH();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0, amountOfToken1);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        aave.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // get rebalance payload.
        Range memory range0 = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        Range memory range1 = Range({
            lowerTick: lowerTick - tickSpacing,
            upperTick: lowerTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](2);
        rangeWeights[0] = RangeWeight({weight: 5000, range: range0});
        rangeWeights[1] = RangeWeight({weight: 5000, range: range1});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceShouldRevertWithS0AAVEWETH() public {
        _setupAAVEWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some aave tokens.
        _getAAVETokens();

        uint256 slot = stdstore.target(vault).sig("init0()").find();

        uint256 init0 = 0;
        vm.store(vault, bytes32(slot), bytes32(init0));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, 0, amountOfToken1 * 2);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        aave.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice0(),
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken0,
            10 ** ERC20(address(weth)).decimals()
        );

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken0,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: true,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(weth),
                    tokenOut: address(aave),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken0,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        vm.expectRevert(bytes("S0"));

        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceWETHAAVEWETH() public {
        _setupAAVEWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getAAVETokens();

        uint256 slot = stdstore.target(vault).sig("init0()").find();

        uint256 init0 = 0;
        vm.store(vault, bytes32(slot), bytes32(init0));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, 0, amountOfToken1 * 2);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        aave.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = (FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice1(), // oracle is inversed
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken1,
            10 ** ERC20(address(aave)).decimals()
        ) * 10050) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken1,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: false,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(aave),
                    tokenOut: address(weth),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken1,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceAAVEWETH() public {
        _setupAAVEWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getWETHTokensAsToken0();

        uint256 slot = stdstore.target(vault).sig("init1()").find();

        uint256 init1 = 0;
        vm.store(vault, bytes32(slot), bytes32(init1));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0 * 2, 0);

        vm.prank(msg.sender);
        weth.approve(vault, amount0);

        vm.prank(msg.sender);
        aave.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = (FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice0(), // oracle is inversed.
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken0,
            10 ** ERC20(address(weth)).decimals()
        ) * 10005) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken0,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: true,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(weth),
                    tokenOut: address(aave),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken0,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function _setupAAVEWETH() internal {
        amountOfToken0 = 10e18;
        amountOfToken1 = 25e18;

        // #region create Vault

        feeTier = 3000;
        /* solhint-disable reentrancy */
        (uint256 amount0, uint256 amount1) = _getAmountsForLiquidity(
            weth,
            usdt,
            feeTier
        );

        uint24[] memory feeTiers = new uint24[](1);
        feeTiers[0] = feeTier;

        address[] memory routers = new address[](1);
        routers[0] = swapRouter;

        vault = IArrakisV2Factory(arrakisV2Factory).deployVault(
            InitializePayload({
                feeTiers: feeTiers,
                token0: address(weth),
                token1: address(aave),
                owner: msg.sender,
                init0: amount0,
                init1: amount1,
                manager: address(simpleManager),
                routers: routers
            }),
            true
        );

        // #endregion create Vault

        /* solhint-enable reentrancy */

        uint8 token0Decimals = ERC20(address(weth)).decimals();
        uint8 token1Decimals = ERC20(address(aave)).decimals();
        address priceFeed = 0xbE23a3AA13038CfC28aFd0ECe4FdE379fE7fBfc4;

        // #region create Oracle.

        oracle = new ChainLinkOracle(
            token0Decimals,
            token1Decimals,
            priceFeed,
            address(0),
            86400,
            true
        );

        // #endregion create Oracle.
    }

    // #endregion test rebalance AAVE / WETH.

    // #region test rebalance WMATIC / WETH.

    // solhint-disable-next-line function-max-lines
    function testSingleRangeNoSwapRebalanceWMATICWETH() public {
        _setupWMATICWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokensWMATICWETH();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0, amountOfToken1);

        vm.prank(msg.sender);
        wmatic.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // get rebalance payload.
        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testMultipleRangeNoSwapRebalanceWMATICWETH() public {
        _setupWMATICWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokensWMATICWETH();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0, amountOfToken1);

        vm.prank(msg.sender);
        wmatic.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // get rebalance payload.
        Range memory range0 = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        Range memory range1 = Range({
            lowerTick: lowerTick - tickSpacing,
            upperTick: lowerTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](2);
        rangeWeights[0] = RangeWeight({weight: 5000, range: range0});
        rangeWeights[1] = RangeWeight({weight: 5000, range: range1});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceShouldRevertWithS0WMATICWETH() public {
        _setupWMATICWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getWMATICTokens();

        uint256 slot = stdstore.target(vault).sig("init1()").find();

        uint256 init1 = 0;
        vm.store(vault, bytes32(slot), bytes32(init1));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0 * 2, 0);

        vm.prank(msg.sender);
        wmatic.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice0(),
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken0,
            10 ** ERC20(address(wmatic)).decimals()
        );

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken0,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: true,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(wmatic),
                    tokenOut: address(weth),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken0,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        vm.expectRevert(bytes("S0"));

        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceWMATICWETH() public {
        _setupWMATICWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc tokens.
        _getWMATICTokens();

        uint256 slot = stdstore.target(vault).sig("init1()").find();

        uint256 init1 = 0;
        vm.store(vault, bytes32(slot), bytes32(init1));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, amountOfToken0 * 2, 0);

        vm.prank(msg.sender);
        wmatic.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = (FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice0(), // oracle is inversed
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken0,
            10 ** ERC20(address(wmatic)).decimals()
        ) * 10050) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken0,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: true,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(wmatic),
                    tokenOut: address(weth),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken0,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeSwapRebalanceWETHWMATICWETH() public {
        _setupWMATICWETH();

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some weth tokens.
        _getWETHTokens();

        uint256 slot = stdstore.target(vault).sig("init0()").find();

        uint256 init0 = 0;
        vm.store(vault, bytes32(slot), bytes32(init0));

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, 0, amountOfToken1 * 2);

        vm.prank(msg.sender);
        wmatic.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        Range memory range = Range({
            lowerTick: lowerTick,
            upperTick: upperTick,
            feeTier: feeTier
        });
        RangeWeight[] memory rangeWeights = new RangeWeight[](1);
        rangeWeights[0] = RangeWeight({weight: 10000, range: range});

        Rebalance memory rebalancePayload = resolver.standardRebalance(
            rangeWeights,
            vaultV2
        );

        (IOracleWrapper oracle_, , uint24 maxSlippage, ) = simpleManager.vaults(
            vault
        );

        uint256 expectedMinReturn = (FullMath.mulDiv(
            FullMath.mulDiv(
                oracle_.getPrice1(), // oracle is inversed.
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            amountOfToken1,
            10 ** ERC20(address(weth)).decimals()
        ) * 10050) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: amountOfToken1,
            expectedMinReturn: expectedMinReturn,
            zeroForOne: false,
            payload: abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(weth),
                    tokenOut: address(wmatic),
                    fee: feeTier,
                    recipient: vault,
                    deadline: type(uint256).max,
                    amountIn: amountOfToken1,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function _setupWMATICWETH() internal {
        amountOfToken0 = 10000e18;
        amountOfToken1 = 4e18;

        // #region create Vault

        feeTier = 500;
        /* solhint-disable reentrancy */
        (uint256 amount0, uint256 amount1) = _getAmountsForLiquidity(
            usdc,
            weth,
            feeTier
        );

        uint24[] memory feeTiers = new uint24[](1);
        feeTiers[0] = feeTier;

        address[] memory routers = new address[](1);
        routers[0] = swapRouter;

        vault = IArrakisV2Factory(arrakisV2Factory).deployVault(
            InitializePayload({
                feeTiers: feeTiers,
                token0: address(wmatic),
                token1: address(weth),
                owner: msg.sender,
                init0: amount0,
                init1: amount1,
                manager: address(simpleManager),
                routers: routers
            }),
            true
        );

        // #endregion create Vault

        /* solhint-enable reentrancy */

        uint8 token0Decimals = ERC20(address(wmatic)).decimals();
        uint8 token1Decimals = ERC20(address(weth)).decimals();
        address priceFeed = 0x327e23A4855b6F663a28c5161541d69Af8973302;

        // #region create Oracle.

        oracle = new ChainLinkOracle(
            token0Decimals,
            token1Decimals,
            priceFeed,
            address(0),
            86400,
            false
        );

        // #endregion create Oracle.
    }

    // #endregion test rebalance WMATIC / WETH.

    // #region internal functions.

    function _rebalanceSetup() internal {
        // do init management.

        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 100,
            maxSlippage: 150,
            managerFeeBPS: 100
        });

        simpleManager.initManagement(params);
    }

    function _getTokensUSDCWETH() internal {
        // usdc
        vm.prank(binanceUSDCHotWallet, binanceUSDCHotWallet);
        usdc.transfer(msg.sender, amountOfToken0);

        // weth
        vm.prank(aaveWETHPool, aaveWETHPool);
        weth.transfer(msg.sender, amountOfToken1);
    }

    function _getUSDCTokens() internal {
        vm.prank(binanceUSDCHotWallet, binanceUSDCHotWallet);
        usdc.transfer(msg.sender, amountOfToken0 * 2);
    }

    function _getWETHTokens() internal {
        vm.prank(aaveWETHPool, aaveWETHPool);
        weth.transfer(msg.sender, amountOfToken1 * 2);
    }

    function _getTokensUSDTWETH() internal {
        // weth
        vm.prank(aaveWETHPool, aaveWETHPool);
        weth.transfer(msg.sender, amountOfToken0);

        // usdt
        vm.prank(binanceUSDTHotWallet, binanceUSDTHotWallet);
        usdt.transfer(msg.sender, amountOfToken1);
    }

    function _getTokensAAVEWETH() internal {
        // weth
        vm.prank(aaveWETHPool, aaveWETHPool);
        weth.transfer(msg.sender, amountOfToken0);

        // aave
        vm.prank(aaveAAVEPool, aaveAAVEPool);
        aave.transfer(msg.sender, amountOfToken1);
    }

    function _getTokensWMATICWETH() internal {
        // wmatic
        vm.prank(aaveWMATICPool, aaveWMATICPool);
        wmatic.transfer(msg.sender, amountOfToken0);

        // weth
        vm.prank(aaveWETHPool, aaveWETHPool);
        weth.transfer(msg.sender, amountOfToken1);
    }

    function _getWMATICTokens() internal {
        vm.prank(aaveWMATICPool, aaveWMATICPool);
        wmatic.transfer(msg.sender, amountOfToken0 * 2);
    }

    function _getUSDTTokens() internal {
        vm.prank(binanceUSDTHotWallet, binanceUSDTHotWallet);
        usdt.transfer(msg.sender, amountOfToken1 * 2);
    }

    function _getAAVETokens() internal {
        vm.prank(aaveAAVEPool, aaveAAVEPool);
        aave.transfer(msg.sender, amountOfToken1 * 2);
    }

    function _getWETHTokensAsToken0() internal {
        vm.prank(aaveWETHPool, aaveWETHPool);
        weth.transfer(msg.sender, amountOfToken0 * 2);
    }

    function _getAmountsForLiquidity(
        IERC20 token0_,
        IERC20 token1_,
        uint24 feeTier_
    ) internal returns (uint256 amount0, uint256 amount1) {
        uniswapV3Factory = IUniswapV3Factory(uniFactory);
        IUniswapV3Pool pool = IUniswapV3Pool(
            uniswapV3Factory.getPool(
                address(token0_),
                address(token1_),
                feeTier_
            )
        );
        (, int24 tick, , , , , ) = pool.slot0();
        tickSpacing = pool.tickSpacing();

        lowerTick = tick - (tick % tickSpacing) - tickSpacing;
        upperTick = tick - (tick % tickSpacing) + 2 * tickSpacing;

        resolver = IArrakisV2Resolver(arrakisV2Resolver);

        (amount0, amount1) = resolver.getAmountsForLiquidity(
            tick,
            lowerTick,
            upperTick,
            1e18
        );
    }

    // #endregion internal functions.
}
