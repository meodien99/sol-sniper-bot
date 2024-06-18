import { LiquidityStateV4 } from "@raydium-io/raydium-sdk";
import { logger } from "../utils";

interface IPoolCacheItem {
  id: string;
  state: LiquidityStateV4
}

export class PoolCache {
  private readonly keys: Map<string, IPoolCacheItem> = new Map<string, IPoolCacheItem>();

  public save(id: string, state: LiquidityStateV4) {
    if (!this.keys.has(state.baseMint.toBase58())) {
      logger.trace(`Caching new pool for mint: ${state.baseMint.toString()}`);

      this.keys.set(state.baseMint.toBase58(), { id, state })
    }
  }

  public async get(mint: string): Promise<IPoolCacheItem> {
    return this.keys.get(mint)!;
  }
}