import { LiquidityPoolKeysV4, Token, TokenAmount, TokenAmountType } from "@raydium-io/raydium-sdk";

export interface IFilterResult {
  ok: boolean;
  message?: string;
}

export interface IFilter {
  execute(poolKeysV4: LiquidityPoolKeysV4): Promise<IFilterResult>
}

export interface IPoolFilterArgs {
  minPoolSize: TokenAmountType;
  maxPoolSize: TokenAmountType;
  quoteToken: Token;
}