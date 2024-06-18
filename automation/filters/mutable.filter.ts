import { Connection } from "@solana/web3.js";
import { IFilter, IFilterResult } from "../../types/filter.types";
import { MetadataAccountDataArgs } from "@metaplex-foundation/mpl-token-metadata";
import { LiquidityPoolKeysV4, getPdaMetadataKey } from "@raydium-io/raydium-sdk";
import { Serializer } from '@metaplex-foundation/umi/serializers';
import { logger } from "../../utils";

export class MutableFilter implements IFilter {
  private readonly errorMessages: string[] = [];

  constructor(
    private readonly connection: Connection,
    private readonly metadataSerializer: Serializer<MetadataAccountDataArgs, MetadataAccountDataArgs>,
    private readonly checkMutable: boolean,
    private readonly checkSocials: boolean
  ) {
    if (this.checkMutable) {
      this.errorMessages.push('mutable');
    }

    if (this.checkSocials) {
      this.errorMessages.push('socials');
    }
  }

  async execute(poolKeysV4: LiquidityPoolKeysV4): Promise<IFilterResult> {
    try {
      // Program derived Address metadata
      const metadataPDA = getPdaMetadataKey(poolKeysV4.baseMint);
      const metadataAccount = await this.connection.getAccountInfo(metadataPDA.publicKey, this.connection.commitment);

      if (!metadataAccount?.data) {
        return {
          ok: false,
          message: 'Mutable -> Failed to fetch account metadata'
        };
      }

      const [metadataAccountDataArgs] = this.metadataSerializer.deserialize(metadataAccount.data);

      const mutable = !this.checkMutable || metadataAccountDataArgs.isMutable;
      const hasSocials = !this.checkSocials || (await this.hasSocials(metadataAccountDataArgs));

      const ok = !mutable && hasSocials;
      const messages: string[] = [];

      if (mutable) {
        messages.push('metadata can be changed');
      }

      if (!hasSocials) {
        messages.push('no socials found');
      }

      return {
        ok,
        message: ok ? undefined : `MutableSocials -> Token ${messages.join(' and ')}`
      };
    } catch (e) {
      logger.error({ mint: poolKeysV4.baseMint }, `MutableSocials -> Failed to check ${this.errorMessages.join(' and ')}`);
    }

    return {
      ok: false,
      message: `MutableSocials -> Failed to check ${this.errorMessages.join(' and ')}`
    }
  }

  private async hasSocials(metadata: MetadataAccountDataArgs): Promise<boolean> {
    const response = await fetch(metadata.uri);
    const data = await response.json();

    return Object.values(data?.extensions ?? {}).some((value: any) => value !== null && value.length > 0);
  }
}