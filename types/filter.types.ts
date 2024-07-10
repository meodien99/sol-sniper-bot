import { LiquidityStateV4, Token, TokenAmount } from "@raydium-io/raydium-sdk-v2";

export interface IFilter {
  execute(poolKeysV4: LiquidityStateV4): Promise<boolean>
}

export interface IPoolFilterArgs {
  minPoolSize: TokenAmount;
  maxPoolSize: TokenAmount;
  quoteToken: Token;
}