import { Connection } from "@solana/web3.js";
import { IFilter, IPoolFilterArgs } from "./filter.types";
import { CHECK_IF_BURNED, CHECK_IF_FREEZABLE, CHECK_IF_MINT_IS_RENOUNCED, CHECK_IF_MUTABLE, CHECK_IF_SOCIALS } from "../../configs";
import { BurnFilter } from "./burn.filter";
import { RenouncedFreezeFilter } from "./renounced.filter";
import { MutableFilter } from "./mutable.filter";
import { PoolSizeFilter } from "./poolSize.filter";
import { getMetadataAccountDataSerializer } from "@metaplex-foundation/mpl-token-metadata";
import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
import { logger } from "../../utils";

export class PoolFilters {
  private readonly filters: IFilter[] = [];

  constructor(readonly connection: Connection, readonly args: IPoolFilterArgs) {
    if (CHECK_IF_BURNED) {
      this.filters.push(new BurnFilter(connection));
    }

    if (CHECK_IF_MINT_IS_RENOUNCED || CHECK_IF_FREEZABLE) {
      this.filters.push(new RenouncedFreezeFilter(connection, CHECK_IF_MINT_IS_RENOUNCED, CHECK_IF_FREEZABLE));
    }

    if (CHECK_IF_MUTABLE || CHECK_IF_SOCIALS) {
      this.filters.push(new MutableFilter(connection, getMetadataAccountDataSerializer(), CHECK_IF_MUTABLE, CHECK_IF_SOCIALS));
    }

    if (!args.minPoolSize.isZero() || !args.maxPoolSize.isZero()) {
      this.filters.push(new PoolSizeFilter(connection, args.quoteToken, args.minPoolSize, args.maxPoolSize));
    }
  }

  public async execute(poolKeysV4: LiquidityPoolKeysV4): Promise<boolean> {
    if (this.filters.length === 0) {
      return true;
    }

    const results = await Promise.all(this.filters.map(f => f.execute(poolKeysV4)));
    const pass = results.every(r => r.ok);

    if (!pass) {
      for (const result of results.filter((r) => !r.ok && !!r.message)) {
        logger.trace(result.message);
      }

      return false;
    }

    return true;
  }
}