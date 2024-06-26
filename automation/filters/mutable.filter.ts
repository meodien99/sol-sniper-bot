import { Connection } from "@solana/web3.js";
import { IFilter } from "../../types/filter.types";
import { MetadataAccountDataArgs } from "@metaplex-foundation/mpl-token-metadata";
import { LiquidityState, getPdaMetadataKey } from "@raydium-io/raydium-sdk";
import { Serializer } from '@metaplex-foundation/umi/serializers';
import { logger } from "../../utils";
import { CHECK_IF_MUTABLE, CHECK_IF_SOCIALS } from "../../configs";

export class MutableFilter implements IFilter {
  private readonly errorMessages: string[] = [];

  constructor(
    private readonly connection: Connection,
    private readonly metadataSerializer: Serializer<MetadataAccountDataArgs, MetadataAccountDataArgs>,
  ) { }

  async execute(poolState: LiquidityState): Promise<boolean> {
    try {
      // Program derived Address metadata
      const metadataPDA = getPdaMetadataKey(poolState.baseMint);
      const metadataAccount = await this.connection.getAccountInfo(metadataPDA.publicKey, this.connection.commitment);

      if (!metadataAccount?.data) {
        // logger.error({ mint: poolState.baseMint.toString() }, 'Mutable -> Failed to fetch account metadata');
        return false;
      }

      const [metadataAccountDataArgs] = this.metadataSerializer.deserialize(metadataAccount.data);

      const tests = [];

      if (CHECK_IF_MUTABLE) {
        const mutable = metadataAccountDataArgs.isMutable;

        tests.push(mutable);
      }

      if(CHECK_IF_SOCIALS) {
        const hasSocials = await this.hasSocials(metadataAccountDataArgs);

        tests.push(hasSocials);
      }

      return tests.every((passed) => passed === true);
    } catch (e) {
      logger.error({ mint: poolState.baseMint.toString() }, `MutableFilter -> Failed to check metadata`);
    }

    return false;
  }

  private async hasSocials(metadata: MetadataAccountDataArgs): Promise<boolean> {
    if(!metadata.uri) {
      return false;
    }
    
    const response = await fetch(metadata.uri);
    const data = await response.json();

    return Object.values(data?.extensions ?? {}).some((value: any) => value !== null && value.length > 0);
  }
}