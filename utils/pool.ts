import { Liquidity, LiquidityPoolKeys, LiquidityStateV4, MAINNET_PROGRAM_ID, Market, jsonInfo2PoolKeys } from "@raydium-io/raydium-sdk";
import { PublicKey } from "@solana/web3.js";
import { MinimalMarketLayoutV3 } from "./market";

export function createPoolKeys(
  id: PublicKey,
  accountData: LiquidityStateV4,
  minimalMarketLayoutV3: MinimalMarketLayoutV3
): LiquidityPoolKeys {
  return jsonInfo2PoolKeys({
    id,
    baseMint: accountData.baseMint,
    quoteMint: accountData.quoteMint,
    lpMint: accountData.lpMint,
    baseDecimals: accountData.baseDecimal.toNumber(),
    quoteDecimals: accountData.quoteDecimal.toNumber(),
    lpDecimals: 5,
    version: 4,
    programId: MAINNET_PROGRAM_ID.AmmV4,
    authority: Liquidity.getAssociatedAuthority({
      programId: MAINNET_PROGRAM_ID.AmmV4,
    }).publicKey,
    openOrders: accountData.openOrders,
    targetOrders: accountData.targetOrders,
    baseVault: accountData.baseVault,
    quoteVault: accountData.quoteVault,
    marketVersion: 3,
    marketProgramId: accountData.marketProgramId,
    marketId: accountData.marketId,
    marketAuthority: Market.getAssociatedAuthority({
      /**
       * Program account: This is the main account of an on-chain program and its address is commonly referred to as a "program id." 
       * Program id's are what transaction instructions reference in order to invoke a program
       */
      programId: accountData.marketProgramId,
      // OpenBook Market IDs are unique identifiers that enable users to create markets for trading various tokens on the Solana Network
      marketId: accountData.marketId,
    }).publicKey,
    marketBaseVault: accountData.baseVault,
    marketQuoteVault: accountData.quoteVault,
    marketBids: minimalMarketLayoutV3.bids,
    marketAsks: minimalMarketLayoutV3.asks,
    marketEventQueue: minimalMarketLayoutV3.eventQueue,
    withdrawQueue: accountData.withdrawQueue,
    lpVault: accountData.lpVault,
    lookupTableAccount: PublicKey.default,
  })
}