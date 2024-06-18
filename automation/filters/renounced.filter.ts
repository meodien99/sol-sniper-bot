import { Connection } from "@solana/web3.js";
import { IFilter, IFilterResult } from "../../types/filter.types";
import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
import { MintLayout } from "@solana/spl-token";
import { logger } from "../../utils";

export class RenouncedFreezeFilter implements IFilter {
  private readonly errorMessages: string[] = [];

  constructor(
    private readonly connection: Connection,
    private readonly checkRenounced: boolean,
    private readonly checkFreezable: boolean
  ) {
    if (this.checkRenounced) {
      this.errorMessages.push('mint');
    }

    if (this.checkFreezable) {
      this.errorMessages.push('freeze');
    }
  }

  async execute(poolKeysV4: LiquidityPoolKeysV4): Promise<IFilterResult> {
    try {
      const accountInfo = await this.connection.getAccountInfo(poolKeysV4.baseMint, this.connection.commitment);
      if (!accountInfo?.data) {
        return {
          ok: false,
          message: 'RenouncedFreeze -> Failed to fetch account data'
        }
      }

      const deserialize = MintLayout.decode(accountInfo.data);
      const renounced = !this.checkRenounced || deserialize.mintAuthorityOption === 0;
      const freezable = !this.checkFreezable || deserialize.freezeAuthorityOption !== 0;

      const ok = renounced && !freezable;

      const messages: string[] = []
      if (!renounced) {
        messages.push('mint');
      }

      if (freezable) {
        messages.push('freeze');
      }

      return { ok, message: ok ? undefined : `RenouncedFreeze -> Creator can ${messages.join(' and ')} tokens` };

    } catch (e) {
      logger.error({ mint: poolKeysV4.baseMint.toString() }, `RenouncedFreeze -> Failed to check if creator can ${this.errorMessages.join(' and ')} tokens`,
      );
    }

    return {
      ok: false,
      message: `RenouncedFreeze -> Failed to check if creator can ${this.errorMessages.join(' and ')} tokens`,
    };
  }
}