import { Connection } from "@solana/web3.js";
import { IFilter } from "../../types/filter.types";
import { LiquidityStateV4 } from "@raydium-io/raydium-sdk-v2";
import { logger } from "../../utils";
import { CHECK_IF_FREEZABLE, CHECK_IF_MINT_IS_RENOUNCED } from "../../configs";
import { MintLayout, RawMint } from "@solana/spl-token";

export class AuthorityFilter implements IFilter {
  constructor(private readonly connection: Connection) { }
  private checkRenounced(rawData: RawMint): boolean {
    const renounced = !CHECK_IF_MINT_IS_RENOUNCED || rawData.mintAuthorityOption === 0;

    if (!renounced) {
      logger.info(`Renounced: False`);
      // logger.error({ mint: poolState.baseMint.toString() }, `checkRenounced -> Creator didn't Renounce tokens`)
    }

    return renounced;
  }

  private checkFreezable(rawData: RawMint): boolean {
    const freezable = !CHECK_IF_FREEZABLE || rawData.freezeAuthorityOption === 1;

    if (freezable) {
      logger.info(`Freezable: True`);
      // logger.error({ mint: poolState.baseMint.toString() }, `checkFreezable -> Creator can Freeze tokens`)
    }

    return freezable;
  }

  async execute(poolState: LiquidityStateV4): Promise<boolean> {
    try {
      const accountInfo = await this.connection.getAccountInfo(poolState.baseMint, this.connection.commitment);
      if (!accountInfo?.data) {
        // logger.error('MintFilter -> Failed to fetch account data')
        return false
      }

      const rawData: RawMint = MintLayout.decode(accountInfo.data);
      const tests = [];

      if (CHECK_IF_MINT_IS_RENOUNCED) {
        tests.push(this.checkRenounced(rawData));
      }

      if(CHECK_IF_FREEZABLE) {
        // should can not freezable tokens
        tests.push(!this.checkFreezable(rawData));
      }

      return tests.every((passed) => passed === true);
    } catch (e: any) {
      logger.error({ mint: poolState.baseMint.toString() }, `[AuthorityFilter] Failed to get AccountInfo`);
    }

    return false;
  }
}