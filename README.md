
# Arrakis contest details

- Join [Sherlock Discord](https://discord.gg/MABEWyASkp)
- Submit findings using the issue page in your private contest repo (label issues as med or high)
- [Read for more details](https://docs.sherlock.xyz/audits/watsons)

# Q&A

### Q: On what chains are the smart contracts going to be deployed?
Mainnet, Arbitrum, Optimism, Polygon, BNB

(potentially any network where Uniswap V3 smart contract infra has been officially deployed)
___

### Q: Which ERC20 tokens do you expect will interact with the smart contracts? 
A wide variety. The "core" contracts fundamentally can be used by any ERC20 token pair except rebasing and fee on transfer tokens (provided Uniswap V3 pool(s) already have been created). The "core" contracts are highly flexible and can be utilized to service a number of very different use-cases.

However the full integrated suite of contracts being audited here is not just the core but "Public Arrakis V2 Vaults" These should be assumed to use SimpleManager.sol and Chainlink oracle feed(s) and thus only support "Major" tokens with suitable chainlink oracle support.
___

### Q: Which ERC721 tokens do you expect will interact with the smart contracts? 
none
___

### Q: Which ERC777 tokens do you expect will interact with the smart contracts? 
none
___

### Q: Are there any FEE-ON-TRANSFER tokens interacting with the smart contracts?

none
___

### Q: Are there any REBASING tokens interacting with the smart contracts?

none
___

### Q: Are the admins of the protocols your contracts integrate with (if any) TRUSTED or RESTRICTED?
There shouldn't be any admins in Uniswap v3 pools.

The only exception might be the Uniswap Governance which can manipulate the protocolFees, in this case I assume we can think of this governance role as TRUSTED.

___

### Q: Is the admin/owner of the protocol/contracts TRUSTED or RESTRICTED?
Proxy Admins (upgrade powers) are considered TRUSTED

ArrakisV2Factory.owner is considered TRUSTED

ArrakisV2.owner is considered TRUSTED

SimpleManager.owner is considered TRUSTED
___

### Q: Are there any additional protocol roles? If yes, please explain in detail:
Other important role in the system:

"Manager" - from the perspective of the "core" the manager is TRUSTED in that manager can pass sensitive call data e.g. slippage parameters to the ArrakisV2.rebalance method that would allow it to extract value. The manager's main function is to call rebalance and to set their managerFeeBPS.

HOWEVER in this "Public Vault" setting the "Manager" role is taken by the SimpleManager.sol smart contract which should add additional checks that make it impossible for SimpleManager.operators to frontrun/sandwich their own rebalance transactions and extract value beyond the accepted slippage tolerance defined in the SimpleManager smart contract for any Arrakis V2 vault managed by SimpleManager.

As stated above SimpleManager.owner is considered trusted. They should be trusted to set appropriate managerFeeBPS and initialize vault management correctly. They also add and remove operators in charge of actually executing vault rebalances via the SimpleManager contract, which they are expected to honestly and correctly.

Operators are "semi trusted" only to be awake and adhere to the expected vault rebalancing strategy. Thus a malicious operator on the SimpleManager.sol should not be able to do anything worse than "grief" - they MAY not execute rebalances or MAY not execute the expected strategy. However the rebalances that are executed MUST NOT be exploitable by frontrun or sandwich.
___

### Q: Is the code/contract expected to comply with any EIPs? Are there specific assumptions around adhering to those EIPs that Watsons should be aware of?
No
___

### Q: Please list any known issues/acceptable risks that should not result in a valid finding.
For ArrakisV2Resolver.sol, the one method that does get consumed by the router is getMintAmounts so ONLY that function is in scope in the contract. 

For ArrakisV2Helper.sol, the one method that does get consumed by resolver.getMintAmounts is totalUnderlying method, so ONLY that function is in scope in the contract. 

For ArrakisV2.sol the rebalance method is not safe against a malicious manager by itself. See SimpleManager.sol to see how management of public vaults is intended. Attacks that extract value on naive ArrakisV2.rebalance calls, (naive in that they don't integrate a SimpleManager.sol instance initialized with proper chainlink oracle(s) for the token pair on the vault of interest as the vault's ArrakisV2.manager) do not constitute a finding!

Upgradability and the admin multisig who can do instant upgrades is considered a known/acceptable risk.

ArrakisV2.owner role is trusted and using this role to extract value from a vault does not constitute a finding. Assume that after a Public ArrakisV2 Vault is initialized properly (with SimpleManager as manager and the correct SwapRouters and Uniswap Pools added) that the ArrakisV2.owner role would then be burned.

Assume that part of initialization process for a Public ArrakisV2 Vault is to mint some shares and transfer them to 0x0000000000000....dead so that the LP token cannot go to totalSupply == 0 ever again. Donation attacks that utilize the malleability of the price of 1 LP token when LP token supply can go to 0 and then be minted again is a known vector, mitigated by the above assumption.

___

### Q: Please provide links to previous audits (if any).
First audits of Arrakis V2 core (previous version): https://github.com/ArrakisFinance/v2-core/tree/main/audit

Recent audits (up to date):

https://gist.github.com/kassandraoftroy/b820573c16972e158715678004ae2dff

https://gist.github.com/kassandraoftroy/6ab217b265b29ce7c33106e5d57bbe4b

https://gist.github.com/kassandraoftroy/25f7208adb770abee9f46978326cfb3f
___

### Q: Are there any off-chain mechanisms or off-chain procedures for the protocol (keeper bots, input validation expectations, etc)?
Yes the SimpleManager.operators are keeper bots running the "off chain logic" that defines the "market making strategy." While it is generally expected that these keeper bots are not malicious, are mostly available/awake, and are running off chain logic to create the rebalance payloads on the expected "market making strategy," even in the absence of this where a malicious keeper bot passes arbitrary payloads to rebalance, there should be no way to extract value from these rebalances directly beyond the acceptable slippage tolerance defined in SimpleManager. 
___

### Q: In case of external protocol integrations, are the risks of external contracts pausing or executing an emergency withdrawal acceptable? If not, Watsons will submit issues related to these situations that can harm your protocol's functionality.
No, uniswap and chainlink our only integrations should not have upgradeable contracts. In the case of chainlink integration we also have some nice circuit breakers in the case of chainlink oracle malfunction (if last observation is too long ago, will revert)
___



# Audit scope


[v2-periphery @ ee6d7c5f3ffb212887db4ec0e595618ea418070f](https://github.com/ArrakisFinance/v2-periphery/tree/ee6d7c5f3ffb212887db4ec0e595618ea418070f)
- [v2-periphery/contracts/ArrakisV2Router.sol](v2-periphery/contracts/ArrakisV2Router.sol)
- [v2-periphery/contracts/RouterSwapExecutor.sol](v2-periphery/contracts/RouterSwapExecutor.sol)
- [v2-periphery/contracts/abstract/ArrakisV2RouterStorage.sol](v2-periphery/contracts/abstract/ArrakisV2RouterStorage.sol)

[v2-manager-templates @ 9b598356f9fb31e4fbaf07acf060e1f60409a7b0](https://github.com/ArrakisFinance/v2-manager-templates/tree/9b598356f9fb31e4fbaf07acf060e1f60409a7b0)
- [v2-manager-templates/contracts/SimpleManager.sol](v2-manager-templates/contracts/SimpleManager.sol)
- [v2-manager-templates/contracts/oracles/ChainLinkOracle.sol](v2-manager-templates/contracts/oracles/ChainLinkOracle.sol)
- [v2-manager-templates/contracts/oracles/ChainLinkOraclePivot.sol](v2-manager-templates/contracts/oracles/ChainLinkOraclePivot.sol)

[v2-core @ 9133fc412b65c7a902f62f1ad135f062e927b092](https://github.com/ArrakisFinance/v2-core/tree/9133fc412b65c7a902f62f1ad135f062e927b092)
- [v2-core/contracts/ArrakisV2.sol](v2-core/contracts/ArrakisV2.sol)
- [v2-core/contracts/ArrakisV2Beacon.sol](v2-core/contracts/ArrakisV2Beacon.sol)
- [v2-core/contracts/ArrakisV2Factory.sol](v2-core/contracts/ArrakisV2Factory.sol)
- [v2-core/contracts/abstract/ArrakisV2FactoryStorage.sol](v2-core/contracts/abstract/ArrakisV2FactoryStorage.sol)
- [v2-core/contracts/abstract/ArrakisV2Storage.sol](v2-core/contracts/abstract/ArrakisV2Storage.sol)
- [v2-core/contracts/ArrakisV2Resolver.sol](v2-core/contracts/ArrakisV2Resolver.sol)
- [v2-core/contracts/ArrakisV2Helper.sol](v2-core/contracts/ArrakisV2Helper.sol)
- [v2-core/contracts/libraries/Pool.sol](v2-core/contracts/libraries/Pool.sol)
- [v2-core/contracts/libraries/Position.sol](v2-core/contracts/libraries/Position.sol)
- [v2-core/contracts/libraries/Underlying.sol](v2-core/contracts/libraries/Underlying.sol)


