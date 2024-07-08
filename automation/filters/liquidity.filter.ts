import { Connection } from "@solana/web3.js";
import { IFilter } from "../../types/filter.types";
import { LiquidityStateV4 } from "@raydium-io/raydium-sdk";
import { logger } from "../../utils";
import { MintLayout } from "@solana/spl-token";
import { BN } from "bn.js";
import { MIN_LP_BURNED_PERCENT } from "../../configs";

export class LiquidityFilter implements IFilter {
  constructor(private readonly connection: Connection) { }

  async execute(poolState: LiquidityStateV4): Promise<boolean> {
    try {
      const accountInfo = await this.connection.getAccountInfo(poolState.lpMint, this.connection.commitment);
      if (!accountInfo?.data) {
        logger.error('BurnFluter -> Failed to fetch account data')
        return false
      }
      const rawData = MintLayout.decode(accountInfo.data);

      const supplyBN = new BN(rawData.supply.toString());
      const expo = new BN(Math.pow(10, rawData.decimals));
      const lpReserve = poolState.lpReserve.div(expo);
      const actualSupply = supplyBN.div(expo);

      // https://github.com/raydium-io/raydium-frontend/blob/572e4973656e899d04e30bfad1f528efbf79f975/src/pages/liquidity/add.tsx#L646
      const maxLpSupply = BN.max(actualSupply, lpReserve.sub(new BN(1)));
      const burnAmt = maxLpSupply.sub(actualSupply);
      const burnedPercent = burnAmt.toNumber() / maxLpSupply.toNumber() * 100;

      const minBurnedPercent = MIN_LP_BURNED_PERCENT;

      const burned = burnedPercent >= minBurnedPercent;

      if (!burned) {
        logger.info(`Burned: False`);
      }

      return burned;
    } catch (e: any) {
      logger.error({ mint: poolState.baseMint.toString(), lpMint: poolState.lpMint.toString() }, `Failed to get LP Info`);
    }

    return false;
  }
}