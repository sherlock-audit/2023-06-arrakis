// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.13;

import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {
    IUniswapV3Factory
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {
    IUniswapV3Pool
} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {
    IArrakisV2,
    Rebalance
} from "@arrakisfi/v2-core/contracts/interfaces/IArrakisV2.sol";
import {FullMath} from "@arrakisfi/v3-lib-0.8/contracts/FullMath.sol";
import {IOwnable} from "./interfaces/IOwnable.sol";
import {IOracleWrapper} from "./interfaces/IOracleWrapper.sol";
import {IDecimals} from "./interfaces/IDecimals.sol";

import {hundred_percent, ten_percent} from "./constants/CSimpleManager.sol";

/// @title SimpleManager
/// @dev Most simple manager to manage public vault on Arrakis V2.
contract SimpleManager is OwnableUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct VaultInfo {
        IOracleWrapper oracle;
        uint24 maxDeviation;
        uint24 maxSlippage;
        uint16 managerFeeBPS;
    }

    struct SetupParams {
        address vault;
        IOracleWrapper oracle;
        uint24 maxDeviation;
        uint24 maxSlippage;
        uint16 managerFeeBPS;
    }

    IUniswapV3Factory public immutable uniFactory;

    mapping(address => VaultInfo) public vaults;

    EnumerableSet.AddressSet internal _operators;

    event InitManagement(
        address vault,
        address oracle,
        uint24 maxDeviation,
        uint24 maxSlippage,
        uint16 managerFeeBPS
    );
    event RebalanceVault(address vault, address caller);
    event AddOperators(address[] operators);
    event RemoveOperators(address[] operators);
    event SetManagerFeeBPS(address[] vaults, uint16 managerFeeBPS);
    event SetManagerFeeBPS(address vault, uint16 managerFeeBPS);

    modifier requireAddressNotZero(address addr) {
        require(addr != address(0), "ZA");
        _;
    }

    constructor(
        IUniswapV3Factory uniFactory_
    ) requireAddressNotZero(address(uniFactory_)) {
        uniFactory = uniFactory_;
    }

    function initialize(
        address owner_
    ) external initializer requireAddressNotZero(owner_) {
        _transferOwnership(owner_);
    }

    /// @notice Initialize management
    /// @dev onced initialize Arrakis will start to manage the initialize vault
    /// @param params SetupParams struct containing data for manager vault
    function initManagement(
        SetupParams calldata params
    ) external onlyOwner requireAddressNotZero(address(params.oracle)) {
        require(params.maxDeviation > 0, "DN");
        require(address(this) == IArrakisV2(params.vault).manager(), "NM");
        require(address(vaults[params.vault].oracle) == address(0), "AV");
        require(params.managerFeeBPS > 0, "MFB");
        /// @dev 10% max slippage allowed by the manager.
        require(params.maxSlippage <= ten_percent, "MS");

        if (params.managerFeeBPS != IArrakisV2(params.vault).managerFeeBPS()) {
            IArrakisV2(params.vault).setManagerFeeBPS(params.managerFeeBPS);

            emit SetManagerFeeBPS(params.vault, params.managerFeeBPS);
        }

        vaults[params.vault] = VaultInfo({
            oracle: params.oracle,
            maxDeviation: params.maxDeviation,
            maxSlippage: params.maxSlippage,
            managerFeeBPS: params.managerFeeBPS
        });

        emit InitManagement(
            params.vault,
            address(params.oracle),
            params.maxDeviation,
            params.maxSlippage,
            params.managerFeeBPS
        );
    }

    /// @notice Rebalance vault
    /// @dev only an operator of the contract Arrakis Finance can call the contract
    /// @param vault_ address of the Arrakis V2 vault to rebalance
    /// @param rebalanceParams_ rebalance parameters.
    // solhint-disable-next-line function-max-lines, code-complexity
    function rebalance(
        address vault_,
        Rebalance calldata rebalanceParams_
    ) external {
        require(_operators.contains(msg.sender), "NO");
        require(
            IArrakisV2(vault_).manager() == address(this) &&
                address(vaults[vault_].oracle) != address(0),
            "NM"
        );
        VaultInfo memory vaultInfo = vaults[vault_];

        address token0;
        address token1;
        uint8 token0Decimals;
        uint8 token1Decimals;
        uint24[] memory checked;
        uint256 oraclePrice;
        uint256 increment;

        uint256 mintsLength = rebalanceParams_.mints.length;

        if (mintsLength > 0 || rebalanceParams_.swap.amountIn > 0) {
            token0 = address(IArrakisV2(vault_).token0());
            token1 = address(IArrakisV2(vault_).token1());
            token0Decimals = IDecimals(token0).decimals();
            token1Decimals = IDecimals(token1).decimals();
        }

        if (mintsLength > 0) {
            checked = new uint24[](mintsLength);
            oraclePrice = vaultInfo.oracle.getPrice0();
        }

        for (uint256 i; i < mintsLength; ++i) {
            if (
                _includes(
                    rebalanceParams_.mints[i].range.feeTier,
                    checked,
                    increment
                )
            ) continue;

            IUniswapV3Pool pool = IUniswapV3Pool(
                _getPool(
                    token0,
                    token1,
                    rebalanceParams_.mints[i].range.feeTier
                )
            );

            uint256 sqrtPriceX96;

            (sqrtPriceX96, , , , , , ) = pool.slot0();

            uint256 poolPrice = FullMath.mulDiv(
                sqrtPriceX96 * sqrtPriceX96,
                10 ** token0Decimals,
                2 ** 192
            );

            _checkDeviation(
                poolPrice,
                oraclePrice,
                vaultInfo.maxDeviation,
                token1Decimals
            );

            checked[increment] = rebalanceParams_.mints[i].range.feeTier;
            increment++;
        }

        // check expectedMinReturn on rebalance swap against oracle
        if (rebalanceParams_.swap.amountIn > 0) {
            _checkMinReturn(
                rebalanceParams_,
                vaultInfo.oracle,
                vaultInfo.maxSlippage,
                token0Decimals,
                token1Decimals
            );
        }

        IArrakisV2(vault_).rebalance(rebalanceParams_);

        emit RebalanceVault(vault_, msg.sender);
    }

    /// @notice Withdraw and Collect Fees generated by vaults on Uni v3
    /// @dev only the owner of the contract Arrakis Finance can call the contract
    /// @param vaults_ array of vaults where to collect fees
    /// @param tokens_ array of tokens where to withdraw fees
    /// @param target receiver of fees collection
    // solhint-disable-next-line code-complexity
    function withdrawAndCollectFees(
        IArrakisV2[] calldata vaults_,
        IERC20[] calldata tokens_,
        address target
    ) external onlyOwner requireAddressNotZero(target) {
        uint256 vaultsLength = vaults_.length;

        // #region withdraw from vaults.

        for (uint256 i; i < vaultsLength; ++i) {
            require(
                vaults_[i].manager() == address(this) &&
                    address(vaults[address(vaults_[i])].oracle) != address(0),
                "NM"
            );

            vaults_[i].withdrawManagerBalance();
        }

        // #endregion withdraw from vaults.

        // #region transfer token to target.

        uint256 tokensLength = tokens_.length;
        for (uint256 i; i < tokensLength; ++i) {
            uint256 balance = IERC20(tokens_[i]).balanceOf(address(this));
            if (balance > 0) IERC20(tokens_[i]).safeTransfer(target, balance);
        }

        // #endregion transfer token to target.
    }

    /// @notice Set manager fee bps as manager
    /// @dev only the owner of simple manager call this function
    /// @param vaults_ array of vaults where to update manager fee bps
    /// @param managerFeeBPS_ new value of manager fee bps
    // solhint-disable-next-line code-complexity
    function setManagerFee(
        address[] calldata vaults_,
        uint16 managerFeeBPS_
    ) external onlyOwner {
        uint256 vaultsLength = vaults_.length;
        for (uint256 i; i < vaultsLength; ++i) {
            require(address(vaults[vaults_[i]].oracle) != address(0), "NM");
            require(vaults[vaults_[i]].managerFeeBPS != managerFeeBPS_, "NU");
            vaults[vaults_[i]].managerFeeBPS = managerFeeBPS_;

            IArrakisV2(vaults_[i]).setManagerFeeBPS(managerFeeBPS_);
        }

        emit SetManagerFeeBPS(vaults_, managerFeeBPS_);
    }

    /// @notice for adding operators
    /// @param operators_ list of operators to add
    /// @dev only callable by owner
    function addOperators(address[] calldata operators_) external onlyOwner {
        uint256 operatorsLength = operators_.length;
        require(operatorsLength > 0, "ZO");
        for (uint256 i; i < operatorsLength; ++i) {
            require(
                operators_[i] != address(0) && _operators.add(operators_[i]),
                "O"
            );
        }

        emit AddOperators(operators_);
    }

    /// @notice for removing operators
    /// @param operators_ list of operators to remove
    /// @dev only callable by owner
    function removeOperators(address[] memory operators_) external onlyOwner {
        uint256 operatorsLength = operators_.length;
        require(operatorsLength > 0, "ZO");
        for (uint256 i; i < operatorsLength; ++i) {
            require(_operators.remove(operators_[i]), "NO");
        }

        emit RemoveOperators(operators_);
    }

    /// @notice get list of operators
    /// @return operators array of address representing operators
    function getOperators() external view returns (address[] memory) {
        return _operators.values();
    }

    /// @notice check if it's operators
    /// @param operator_ address to check if it's an operator
    /// @return return true if inputed address is an operator
    /// otherwise return false
    function isOperator(address operator_) external view returns (bool) {
        return _operators.contains(operator_);
    }

    function _checkMinReturn(
        Rebalance memory rebalanceParams_,
        IOracleWrapper oracle_,
        uint24 maxSlippage,
        uint8 decimals0,
        uint8 decimals1
    ) internal view {
        if (rebalanceParams_.swap.zeroForOne) {
            require(
                FullMath.mulDiv(
                    rebalanceParams_.swap.expectedMinReturn,
                    10 ** decimals0,
                    rebalanceParams_.swap.amountIn
                ) >
                    FullMath.mulDiv(
                        oracle_.getPrice0(),
                        hundred_percent - maxSlippage,
                        hundred_percent
                    ),
                "S0"
            );
        } else {
            require(
                FullMath.mulDiv(
                    rebalanceParams_.swap.expectedMinReturn,
                    10 ** decimals1,
                    rebalanceParams_.swap.amountIn
                ) >
                    FullMath.mulDiv(
                        oracle_.getPrice1(),
                        hundred_percent - maxSlippage,
                        hundred_percent
                    ),
                "S1"
            );
        }
    }

    function _getPool(
        address token0,
        address token1,
        uint24 feeTier
    ) internal view returns (address pool) {
        pool = uniFactory.getPool(token0, token1, feeTier);

        require(pool != address(0), "NP");
    }

    function _checkDeviation(
        uint256 currentPrice_,
        uint256 oraclePrice_,
        uint24 maxDeviation_,
        uint8 priceDecimals_
    ) internal pure {
        uint256 deviation = FullMath.mulDiv(
            FullMath.mulDiv(
                currentPrice_ > oraclePrice_
                    ? currentPrice_ - oraclePrice_
                    : oraclePrice_ - currentPrice_,
                10 ** priceDecimals_,
                oraclePrice_
            ),
            hundred_percent,
            10 ** priceDecimals_
        );

        require(deviation <= maxDeviation_, "maxDeviation");
    }

    function _includes(
        uint24 target,
        uint24[] memory set,
        uint256 upperIndex
    ) internal pure returns (bool) {
        for (uint256 j; j < upperIndex; j++) {
            if (set[j] == target) {
                return true;
            }
        }

        return false;
    }
}
