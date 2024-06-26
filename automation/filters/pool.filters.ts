import { Connection } from "@solana/web3.js";
import { IFilter, IPoolFilterArgs } from "../../types/filter.types";
import { CHECK_IF_BURNED, CHECK_IF_FREEZABLE, CHECK_IF_MINT_IS_RENOUNCED, CHECK_IF_MUTABLE, CHECK_IF_SOCIALS } from "../../configs";
import { MutableFilter } from "./mutable.filter";
import { PoolSizeFilter } from "./poolSize.filter";
import { getMetadataAccountDataSerializer } from "@metaplex-foundation/mpl-token-metadata";
import { LiquidityStateV4 } from "@raydium-io/raydium-sdk";
import { AuthorityFilter } from "./authority.filters";
import { LiquidityFilter } from "./liquidity.filter";

export class PoolFilters {
  private readonly filters: IFilter[] = [];

  constructor(readonly connection: Connection, readonly args: IPoolFilterArgs) {
    if (CHECK_IF_MINT_IS_RENOUNCED || CHECK_IF_FREEZABLE) {
      this.filters.push(new AuthorityFilter(connection));
    }

    if(CHECK_IF_BURNED) {
      this.filters.push(new LiquidityFilter(connection));
    }

    if (CHECK_IF_MUTABLE || CHECK_IF_SOCIALS) {
      this.filters.push(new MutableFilter(connection, getMetadataAccountDataSerializer()));
    }

    if (!args.minPoolSize.isZero() || !args.maxPoolSize.isZero()) {
      this.filters.push(new PoolSizeFilter(connection, args.quoteToken, args.minPoolSize, args.maxPoolSize));
    }
  }

  public async execute(poolState: LiquidityStateV4): Promise<boolean> {
    if (this.filters.length === 0) {
      return true;
    }

    const results = await Promise.all(this.filters.map(f => f.execute(poolState)));

    return results.every(passed => !!passed);
  }
}