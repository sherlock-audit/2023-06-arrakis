// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import "../utils/TestWrapper.sol";
import "forge-std/Vm.sol";
import {SimpleManager, IArrakisV2, FullMath} from "contracts/SimpleManager.sol";
import {IOracleWrapper} from "contracts/interfaces/IOracleWrapper.sol";
import {UniswapV3PoolOracle} from "contracts/oracles/UniswapV3PoolOracle.sol";
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
import {binanceUSDCHotWallet, aaveWETHPool} from "../constants/Wallets.sol";
import {usdc, weth} from "../constants/Tokens.sol";
import {
    arrakisV2Factory,
    arrakisV2Resolver,
    uniFactory,
    swapRouter,
    vm
} from "../constants/ContractsInstances.sol";
import {hundred_percent} from "contracts/constants/CSimpleManager.sol";

// solhint-disable
contract SimpleManagerTest is TestWrapper {
    using stdStorage for StdStorage;

    uint256 public constant AMOUNT_OF_USDC = 100000e6;
    uint256 public constant AMOUNT_OF_WETH = 100e18;

    uint16 public constant MANAGER_FEE_BPS = 100;

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

        // #region create Vault

        feeTier = 500;
        /* solhint-disable reentrancy */
        (uint256 amount0, uint256 amount1) = _getAmountsForLiquidity();

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

        IUniswapV3Pool pool = IUniswapV3Pool(
            IUniswapV3Factory(uniFactory).getPool(
                address(usdc),
                address(weth),
                feeTier
            )
        );

        // #region create Oracle.

        oracle = new UniswapV3PoolOracle(pool, 100);

        // #endregion create Oracle.
    }

    // #region test initManagement.

    function testInitManagementCallerNotOwner() public {
        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 100,
            maxSlippage: 100,
            managerFeeBPS: 100
        });
        vm.prank(msg.sender);
        vm.expectRevert(bytes("Ownable: caller is not the owner"));

        simpleManager.initManagement(params);
    }

    function testInitManagementTwapDeviationZero() public {
        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 0,
            maxSlippage: 100,
            managerFeeBPS: 100
        });
        vm.expectRevert(bytes("DN"));

        simpleManager.initManagement(params);
    }

    function testInitManagementNotManagedBySimpleManager() public {
        vm.prank(msg.sender);
        IArrakisV2SetManager(vault).setManager(msg.sender);

        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 100,
            maxSlippage: 100,
            managerFeeBPS: 100
        });
        vm.prank(address(this));
        vm.expectRevert(bytes("NM"));

        simpleManager.initManagement(params);
    }

    function testInitManagementAlreadyAdded() public {
        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 100,
            maxSlippage: 100,
            managerFeeBPS: 100
        });

        simpleManager.initManagement(params);

        vm.expectRevert(bytes("AV"));

        simpleManager.initManagement(params);
    }

    function testInitManagementSlippageTooHigh() public {
        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 100,
            maxSlippage: 1001,
            managerFeeBPS: 100
        });

        vm.expectRevert(bytes("MS"));

        simpleManager.initManagement(params);
    }

    function testInitManagementNoManagerFeeBPS() public {
        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 100,
            maxSlippage: 100,
            managerFeeBPS: 0
        });

        vm.expectRevert(bytes("MFB"));

        simpleManager.initManagement(params);
    }

    function testInitManagement() public {
        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 100,
            maxSlippage: 100,
            managerFeeBPS: 200
        });

        simpleManager.initManagement(params);

        // #region asserts.
        (
            IOracleWrapper oracle_,
            uint24 maxDeviation,
            uint24 maxSlippage,
            uint16 managerFeeBPS
        ) = simpleManager.vaults(vault);

        assertEq(address(oracle_), address(oracle));
        assertEq(maxDeviation, params.maxDeviation);
        assertEq(maxSlippage, params.maxSlippage);
        assertEq(managerFeeBPS, params.managerFeeBPS);

        // #endregion asserts.
    }

    // #endregion test initManagement.

    // #region test rebalance.

    // solhint-disable-next-line function-max-lines
    function testSingleRangeNoSwapRebalanceNotCalledByOperator() public {
        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokens();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, AMOUNT_OF_USDC, AMOUNT_OF_WETH);

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

        vm.expectRevert(bytes("NO"));
        vm.prank(msg.sender);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    // solhint-disable-next-line function-max-lines
    function testSingleRangeNoSwapRebalance() public {
        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokens();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, AMOUNT_OF_USDC, AMOUNT_OF_WETH);

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
    function testMultipleRangeNoSwapRebalance() public {
        IArrakisV2 vaultV2 = IArrakisV2(vault);
        // make vault to be managed by SimpleManager.
        _rebalanceSetup();

        // get some usdc and weth tokens.
        _getTokens();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, AMOUNT_OF_USDC, AMOUNT_OF_WETH);

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
    function testSingleRangeSwapRebalanceShouldRevertWithS0() public {
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
            .getMintAmounts(vaultV2, AMOUNT_OF_USDC * 2, 0);

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
            AMOUNT_OF_USDC,
            10 ** ERC20(address(usdc)).decimals()
        );

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: AMOUNT_OF_USDC,
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
                    amountIn: AMOUNT_OF_USDC,
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
    function testSingleRangeSwapRebalance() public {
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
            .getMintAmounts(vaultV2, AMOUNT_OF_USDC * 2, 0);

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
            AMOUNT_OF_USDC,
            10 ** ERC20(address(usdc)).decimals()
        ) + 10 ** ERC20(address(usdc)).decimals();

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: AMOUNT_OF_USDC,
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
                    amountIn: AMOUNT_OF_USDC,
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
    function testSingleRangeSwapRebalanceWETH() public {
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
            .getMintAmounts(vaultV2, 0, AMOUNT_OF_WETH * 2);

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
                oracle_.getPrice1(),
                hundred_percent - maxSlippage,
                hundred_percent
            ),
            AMOUNT_OF_WETH,
            10 ** ERC20(address(weth)).decimals()
        ) * 10050) / 10000;

        rebalancePayload.swap = SwapPayload({
            router: swapRouter,
            amountIn: AMOUNT_OF_WETH,
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
                    amountIn: AMOUNT_OF_WETH,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            )
        });

        rebalancePayload.mints[0].liquidity = 1000;

        simpleManager.addOperators(operators);
        simpleManager.rebalance(vault, rebalancePayload);
    }

    function _rebalanceSetup() internal {
        // do init management.

        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 200,
            maxSlippage: 100,
            managerFeeBPS: 100
        });

        simpleManager.initManagement(params);
    }

    // #endregion test rebalance.

    // #region test withdrawAndCollectFees.

    // solhint-disable-next-line ordering, function-max-lines
    function testWithdrawAndCollectFees() public {
        IArrakisV2 vaultV2 = IArrakisV2(vault);

        _withdrawAndCollectFeesSetup();

        // get some usdc and weth tokens.
        _getTokens();

        //  mint some vault tokens.
        (uint256 amount0, uint256 amount1, uint256 mintAmount) = resolver
            .getMintAmounts(vaultV2, AMOUNT_OF_USDC, AMOUNT_OF_WETH);

        vm.prank(msg.sender);
        usdc.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        // #region change managerBalance0 and managerBalance1.

        uint256 slot = stdstore.target(vault).sig("managerBalance0()").find();

        uint256 managerBalance0 = 100;
        vm.store(vault, bytes32(slot), bytes32(managerBalance0));

        slot = stdstore.target(address(vault)).sig("managerBalance1()").find();

        uint256 managerBalance1 = 1000;
        vm.store(vault, bytes32(slot), bytes32(managerBalance1));

        // #endregion change managerBalance0 and managerBalance1.

        uint256 usdcBalanceBefore = usdc.balanceOf(address(this));
        uint256 wethBalanceBefore = weth.balanceOf(address(this));

        IArrakisV2[] memory vaults = new IArrakisV2[](1);
        vaults[0] = vaultV2;

        IERC20[] memory tokens = new IERC20[](2);
        tokens[0] = usdc;
        tokens[1] = weth;

        simpleManager.withdrawAndCollectFees(vaults, tokens, address(this));

        assertEq(
            usdcBalanceBefore + managerBalance0,
            usdc.balanceOf(address(this))
        );
        assertEq(
            wethBalanceBefore + managerBalance1,
            weth.balanceOf(address(this))
        );
    }

    function testWithdrawAndCollectFeesMultipleVault() public {
        // #region create second vault.

        /* solhint-disable reentrancy */
        (uint256 amount0, uint256 amount1) = _getAmountsForLiquidity();

        uint24[] memory feeTiers = new uint24[](1);
        feeTiers[0] = feeTier;

        address[] memory routers = new address[](1);
        routers[0] = swapRouter;

        address secondVault = IArrakisV2Factory(arrakisV2Factory).deployVault(
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

        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: secondVault,
            oracle: oracle,
            maxDeviation: 200,
            maxSlippage: 100,
            managerFeeBPS: 100
        });

        simpleManager.initManagement(params);

        // #endregion create second vault.

        IArrakisV2 vaultV2 = IArrakisV2(vault);
        IArrakisV2 secondVaultV2 = IArrakisV2(secondVault);

        _withdrawAndCollectFeesSetup();

        // get some usdc and weth tokens.
        _getTokens();

        //  mint some vault tokens.
        uint256 mintAmount;
        (amount0, amount1, mintAmount) = resolver.getMintAmounts(
            vaultV2,
            AMOUNT_OF_USDC,
            AMOUNT_OF_WETH
        );

        vm.prank(msg.sender);
        usdc.approve(vault, amount0);

        vm.prank(msg.sender);
        weth.approve(vault, amount1);

        vm.prank(msg.sender);
        vaultV2.mint(mintAmount, msg.sender);

        _getTokens();

        vm.prank(msg.sender);
        usdc.approve(secondVault, amount0);

        vm.prank(msg.sender);
        weth.approve(secondVault, amount1);

        vm.prank(msg.sender);
        secondVaultV2.mint(mintAmount, msg.sender);

        // #region change managerBalance0 and managerBalance1.

        uint256 slot = stdstore.target(vault).sig("managerBalance0()").find();

        uint256 managerBalance0 = 100;
        vm.store(vault, bytes32(slot), bytes32(managerBalance0));
        vm.store(secondVault, bytes32(slot), bytes32(managerBalance0));

        slot = stdstore.target(address(vault)).sig("managerBalance1()").find();

        uint256 managerBalance1 = 1000;
        vm.store(vault, bytes32(slot), bytes32(managerBalance1));
        vm.store(secondVault, bytes32(slot), bytes32(managerBalance1));

        // #endregion change managerBalance0 and managerBalance1.

        uint256 usdcBalanceBefore = usdc.balanceOf(address(this));
        uint256 wethBalanceBefore = weth.balanceOf(address(this));

        IArrakisV2[] memory vaults = new IArrakisV2[](2);
        vaults[0] = vaultV2;
        vaults[1] = secondVaultV2;

        IERC20[] memory tokens = new IERC20[](2);
        tokens[0] = usdc;
        tokens[1] = weth;

        simpleManager.withdrawAndCollectFees(vaults, tokens, address(this));

        assertEq(
            usdcBalanceBefore + (managerBalance0 * 2),
            usdc.balanceOf(address(this))
        );
        assertEq(
            wethBalanceBefore + (managerBalance1 * 2),
            weth.balanceOf(address(this))
        );
    }

    function _withdrawAndCollectFeesSetup() internal {
        // do init management.

        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 200,
            maxSlippage: 100,
            managerFeeBPS: 100
        });

        simpleManager.initManagement(params);
    }

    // #endregion test withdrawAndCollectFees.

    // #region test add operators.

    function testAddOperatorsCalledNotByOwnerShouldFail() public {
        address[] memory operators_ = new address[](0);

        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        vm.prank(msg.sender);
        simpleManager.addOperators(operators_);
    }

    function testAddOperatorsEmptyArrayShouldFail() public {
        address[] memory operators_ = new address[](0);

        vm.expectRevert(bytes("ZO"));

        simpleManager.addOperators(operators_);
    }

    function testAddOperatorsAddAddressZeroShouldFail() public {
        address[] memory operators_ = new address[](1);

        vm.expectRevert(bytes("O"));

        simpleManager.addOperators(operators_);
    }

    function testAddOperatorsAddAlreadyOperatorShouldFail() public {
        address[] memory operators_ = new address[](1);

        operators_[0] = address(this);

        simpleManager.addOperators(operators_);

        vm.expectRevert(bytes("O"));

        simpleManager.addOperators(operators_);
    }

    function testAddOperators() public {
        address[] memory operators_ = new address[](1);

        operators_[0] = address(this);

        simpleManager.addOperators(operators_);

        assertTrue(simpleManager.isOperator(address(this)));
    }

    // #endregion test add operators.

    // #region test remove operators.

    function testRemoveOperatorsCalledNotByOwnerShouldFail() public {
        address[] memory operators_ = new address[](0);

        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        vm.prank(msg.sender);
        simpleManager.removeOperators(operators_);
    }

    function testRemoveOperatorsEmptyArrayShouldFail() public {
        address[] memory operators_ = new address[](0);

        vm.expectRevert(bytes("ZO"));

        simpleManager.removeOperators(operators_);
    }

    function testRemoveOperatorsNoOperatorShouldFail() public {
        address[] memory operators_ = new address[](1);

        operators[0] = address(this);

        vm.expectRevert(bytes("NO"));

        simpleManager.removeOperators(operators_);
    }

    function testRemoveOperators() public {
        address[] memory operators_ = new address[](1);

        operators_[0] = address(this);

        simpleManager.addOperators(operators_);
        assertTrue(simpleManager.isOperator(address(this)));

        simpleManager.removeOperators(operators_);

        assertFalse(simpleManager.isOperator(address(this)));
    }

    // #endregion test remove operators.

    // #region test set manager fee bps.

    function testSetManagerFeeBPSShouldFailNotManaged() public {
        address[] memory vaults = new address[](1);

        vaults[0] = address(vault);

        vm.expectRevert(bytes("NM"));

        simpleManager.setManagerFee(vaults, 100);
    }

    function testSetManagerFeeBPSShouldFailSameManagerFeeBPS() public {
        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 200,
            maxSlippage: 100,
            managerFeeBPS: 100
        });

        simpleManager.initManagement(params);
        address[] memory vaults = new address[](1);

        vaults[0] = address(vault);

        vm.expectRevert(bytes("NU"));

        simpleManager.setManagerFee(vaults, 100);
    }

    function testSetManagerFeeBPS() public {
        SimpleManager.SetupParams memory params = SimpleManager.SetupParams({
            vault: vault,
            oracle: oracle,
            maxDeviation: 200,
            maxSlippage: 100,
            managerFeeBPS: 100
        });

        simpleManager.initManagement(params);

        (uint256 amount0, uint256 amount1) = _getAmountsForLiquidity();

        uint24[] memory feeTiers = new uint24[](1);
        feeTiers[0] = feeTier;

        address[] memory routers = new address[](1);
        routers[0] = swapRouter;

        address secondVault = IArrakisV2Factory(arrakisV2Factory).deployVault(
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

        params = SimpleManager.SetupParams({
            vault: secondVault,
            oracle: oracle,
            maxDeviation: 200,
            maxSlippage: 100,
            managerFeeBPS: 100
        });

        simpleManager.initManagement(params);

        address[] memory vaults = new address[](2);

        vaults[0] = vault;
        vaults[1] = secondVault;

        simpleManager.setManagerFee(vaults, 200);
    }

    // #endregion test set manager fee bps.

    // #region test get Operators.

    function testGetOperators() public {
        address[] memory operators_ = simpleManager.getOperators();

        assertTrue(operators_.length == 0);

        operators_ = new address[](1);

        operators_[0] = address(this);

        simpleManager.addOperators(operators_);

        address[] memory new0perators_ = simpleManager.getOperators();

        assertTrue(new0perators_.length == 1);
    }

    // #endregion test get Operators.

    // #region test is Operators.

    function testIsOperator() public {
        assertFalse(simpleManager.isOperator(address(this)));

        address[] memory operators_ = new address[](1);

        operators_[0] = address(this);

        simpleManager.addOperators(operators_);
        assertTrue(simpleManager.isOperator(address(this)));
    }

    // #endregion test is Operators.

    // #region internal functions.

    function _getTokens() internal {
        // usdc
        vm.prank(binanceUSDCHotWallet, binanceUSDCHotWallet);
        usdc.transfer(msg.sender, AMOUNT_OF_USDC);

        // weth
        vm.prank(aaveWETHPool, aaveWETHPool);
        weth.transfer(msg.sender, AMOUNT_OF_WETH);
    }

    function _getUSDCTokens() internal {
        vm.prank(binanceUSDCHotWallet, binanceUSDCHotWallet);
        usdc.transfer(msg.sender, AMOUNT_OF_USDC * 2);
    }

    function _getWETHTokens() internal {
        vm.prank(aaveWETHPool, aaveWETHPool);
        weth.transfer(msg.sender, AMOUNT_OF_WETH * 2);
    }

    function _getAmountsForLiquidity()
        internal
        returns (uint256 amount0, uint256 amount1)
    {
        uniswapV3Factory = IUniswapV3Factory(uniFactory);
        IUniswapV3Pool pool = IUniswapV3Pool(
            uniswapV3Factory.getPool(address(usdc), address(weth), 500)
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
