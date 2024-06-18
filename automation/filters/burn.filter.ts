import { Connection } from "@solana/web3.js";
import { IFilter, IFilterResult } from "./filter.types";
import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
import { BaseJSONRPCErrorCode, logger } from "../../utils";

export class BurnFilter implements IFilter {
  constructor(private readonly connection: Connection) { }

  async execute(poolKeysV4: LiquidityPoolKeysV4): Promise<IFilterResult> {
    try {
      const amount = await this.connection.getTokenSupply(poolKeysV4.lpMint, this.connection.commitment);
      const burned = amount.value.uiAmount === 0;

      return {
        ok: burned,
        message: burned ? undefined : 'Burned -> Creator did not burn LP'
      };
    } catch (e: any) {
      if (e.code == BaseJSONRPCErrorCode.INVALID_PARAMS) {
        logger.error({ mint: poolKeysV4.baseMint }, `Failed to check if LP: BaseJSONRPCErrorCode.INVALID_PARAMS`);
        return { ok: true }; // auto pass
      }

      logger.error({ mint: poolKeysV4.baseMint }, `Failed to check if LP is burned`);
    }

    return { ok: false, message: 'Failed to check if LP is burned' };
  }
}