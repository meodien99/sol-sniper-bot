import { Connection } from "@solana/web3.js";
import { IFilter, IFilterResult } from "./filter.types";
import { LiquidityPoolKeysV4, Token, TokenAmount, TokenAmountType } from "@raydium-io/raydium-sdk";
import { logger } from "../../utils";

export class PoolSizeFilter implements IFilter {
  constructor(
    private readonly connection: Connection,
    private readonly quoteToken: Token,
    private readonly minPoolSize: TokenAmountType,
    private readonly maxPoolSize: TokenAmountType,
  ) { }

  async execute(poolKeysV4: LiquidityPoolKeysV4): Promise<IFilterResult> {
    try {
      const response = await this.connection.getTokenAccountBalance(poolKeysV4.quoteVault, this.connection.commitment);
      const poolSize = new TokenAmount(this.quoteToken, response.value.amount, true);
      let isInRange = true;

      if (!this.maxPoolSize?.isZero()) {
        isInRange = poolSize.raw.lte(this.maxPoolSize.raw);

        if (!isInRange) {
          return {
            ok: false,
            message: `PoolSize -> Pool size ${poolSize.toFixed()} > Max Pool Size ${this.maxPoolSize.toFixed()}`
          }
        }
      }

      if (!this.minPoolSize?.isZero()) {
        isInRange = poolSize.raw.gte(this.minPoolSize.raw);

        if (!isInRange) {
          return {
            ok: false,
            message: `PoolSize -> Pool size ${poolSize.toFixed()} < Min Pool Size ${this.minPoolSize.toFixed()}`
          }
        }
      }

      return {
        ok: isInRange
      }
    } catch (e) {
      logger.error({ mint: poolKeysV4.baseMint }, `Failed to check pool size`)
    }

    return {
      ok: false,
      message: `Failed to check pool size`
    }
  }
}