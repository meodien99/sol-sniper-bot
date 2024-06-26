import { Connection } from "@solana/web3.js";
import { IFilter } from "../../types/filter.types";
import { LiquidityStateV4, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import { logger } from "../../utils";

export class PoolSizeFilter implements IFilter {
  constructor(
    private readonly connection: Connection,
    private readonly quoteToken: Token,
    private readonly minPoolSize: TokenAmount,
    private readonly maxPoolSize: TokenAmount,
  ) { }

  async execute(poolState: LiquidityStateV4): Promise<boolean> {
    try {
      const response = await this.connection.getTokenAccountBalance(poolState.quoteVault, this.connection.commitment);
      const poolSize = new TokenAmount(this.quoteToken, response.value.amount, true);
      let isInRange = true;

      if (!this.maxPoolSize?.isZero()) {
        isInRange = poolSize.raw.lte(this.maxPoolSize.raw);

        if (!isInRange) {
          // logger.error({ mint: poolState.baseMint.toString() }, `PoolSize -> Pool size ${poolSize.toFixed()} > Max Pool Size ${this.maxPoolSize.toFixed()}`);
          return false;
        }
      }

      if (!this.minPoolSize?.isZero()) {
        isInRange = poolSize.raw.gte(this.minPoolSize.raw);

        if (!isInRange) {
          // logger.error({ mint: poolState.baseMint.toString() }, `PoolSize -> Pool size ${poolSize.toFixed()} < Min Pool Size ${this.minPoolSize.toFixed()}`);
          return false;
        }
      }

      return isInRange;
    } catch (e) {
      logger.error({ mint: poolState.baseMint.toString() }, `Failed to check pool size`)
    }

    return false;
  }
}