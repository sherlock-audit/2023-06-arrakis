# Arrakis V2 Router Spec

## Router & Swap Executor

**ArrakisV2Router** (aka router contract) receives the approval from the users, transfers funds from users to itself, validate input data, wrap/unwrap eth, deposit/withdraw, stake/unstake, returns funds to users.

**RouterSwapExecutor** (aka executor contract) is responsible for executing swap payloads (prepared off-chain) passed to Router's swapAndAddLiquidity methods. This separation of contracts allows swap payloads to tap "arbitrary" liquidity sources and still be safe.

## Parameter structs

### AddLiquiditData

```
struct AddLiquidityData {
    address vault;
    uint256 amount0Max;
    uint256 amount1Max;
    uint256 amount0Min;
    uint256 amount1Min;
    uint256 amountSharesMin;
    address receiver;
    address gauge;
}
```

- vault : Arrakis Vault addres
- amount0Max : Maximum amount of token0 to forward on mint
- amount1Max : Maximum amount of token1 to forward on mint
- amount0Min : Minimum amount of token0 actually deposited (slippage protection)
- amount1Min : Minimum amount of token1 actually deposited (slippage protection)
- amountSharesMin : Minimum amount of shares to mint (slippage protection)
- receiver : Address to receive minted LP tokens
- gauge : Address of gauge to stake tokens in (ignore with address(0))

### RemoveLiquiditData

```
struct RemoveLiquidityData {
    address vault;
    uint256 burnAmount;
    uint256 amount0Min;
    uint256 amount1Min;
    address payable receiver;
    bool receiveETH;
    address gauge;
}
```

- vault : Arrakis Vault address
- burnAmount : Amount of LP tokens to burn
- amount0Min : Minimum amount of token0 to receive
- amount1Min : Minimum amount of token1 to receive
- receiver : Address to receive underlying tokens
- receiveETH : Bool indicating if user wants to receive in native ETH
- gauge : Address of gauge to unstake from (ignore with address(0))

### SwapData

```
struct SwapData {
    uint256 amountInSwap;
    uint256 amountOutSwap;
    bool zeroForOne;
    address swapRouter;
    bytes swapPayload;
}
```

- amountInSwap : Max amount being swapped
- amountOutSwap : Min amount received on swap (slippage protection)
- zeroForOne : Bool indicating swap direction
- swapRouter : Address for swap call
- swapPayload : Payload for swap call

### SwapAndAddData

```
struct SwapAndAddData {
    SwapData swapData;
    AddLiquidityData addData;
}
```

- swapData : SwapData struct
- addData : AddLiquidityData struct

## ArrakisV2Router

### addLiquidity

deposits into an ArrakisV2 vault

```
function addLiquidity(
    AddLiquidityData memory _addData
)
    external
    payable
    returns (
        uint256 amount0,
        uint256 amount1,
        uint256 mintAmount
    );
```

- if msg.value is greater than 0, this function will wrap ETH into WETH and send non-used ether back to the user.
- if AddLiquidityData.gauge is filled, this function will validate if the gauge's `staking_token()` matches the vault address.

## removeLiquidity

withdraws from an ArrakisV2 vault

```
function removeLiquidity(
    RemoveLiquidityData memory _removeData
)
    external
    returns (
        uint256 amount0,
        uint256 amount1,
        uint128 liquidityBurned
    );
```

- if RemoveLiquidityData.gauge is filled, this function will validate if the gauge's `staking_token()` matches the vault address, claim rewards for the user and unstake.
- if RemoveLiquidityData.receiveETH is true, then after withdrawing from the vault this function will unwrap WETH into ETH and before transfering to the user.

## swapAndAddLiquidity

performs a token0/token1 swap, then deposits into ArrakisV2 vault

```
function swapAndAddLiquidity(
    SwapAndAddData memory _swapData
)
    external
    payable
    returns (
        uint256 amount0,
        uint256 amount1,
        uint256 mintAmount,
        uint256 amount0Diff,
        uint256 amount1Diff
    );
```

- if msg.value is larger than 0, this function will wrap ETH into WETH and after deposit send non-used ether back to the user.
- if AddLiquidityData.gauge is filled, this function will validate if the gauge's `staking_token()` matches the vault address.
- if AddLiquidityData.gauge is filled, this function will stake the LP tokens in the gauge after depositing to the vault.
- if the user is depositing 2 tokens and doing a swap => if token0 is being swapped for token1, AddLiquidityData.amount0Max should be the amount of token0 being deposited "normally" plus the amount to be swapped (SwapData.amountInSwap). (same applies for amount1Max on the inverse swap scenario)

### Permit2 Routes

Note that ...

- `addLiquidityPermit2`
- `swapAndAddLiquidityPermit2`
- `removeLiquidityPermit2`

... are all identical in core functionality to their "classical" counterpart, the only difference is in how the `Permit2` function transfers tokens from the msg.sender into the router contract, by using the permit2 contract and off-chain signature patterns rather than separate approval transactions (slow and gas intensive).

Note that if depositing ETH (not WETH) on `addLiquidityPermit2` or `swapAndAddLiquidityPermit2` then only one permit approval is needed (sign a PermitTransferFrom struct not a PermitBatchTransferFrom struct) since ETH needs no approval and goes in `msg.value`. If using ONLY ETH (passing 0 for other token) than NO permit signature necessary. However, if not using ETH than a PermitBatchTransferFrom is always necessary with both token0 and token1 transfers filled in EVEN if one of the inputs is 0.

See the [repo](https://github.com/Uniswap/Permit2) to learn more about Permit2.
