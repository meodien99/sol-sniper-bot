import { logger, sleep } from "../utils";
import { PoolInfoCacheItem } from "./cache.types";
import { Raydium, toAmmComputePoolInfo } from "@raydium-io/raydium-sdk-v2";

export class PoolInfoCache {
  private readonly pool: Map<string, PoolInfoCacheItem> = new Map<string, PoolInfoCacheItem>();
  private readonly deleted: Set<string> = new Set<string>();

  constructor(private readonly raydium: Raydium) { }

  // // fetch data by intervally request to HTTP
  // // temporary don't be used because the HTTP server needs approximatly ~10m to save onchain data.
  // public async run(config?: { intervalInMs: number }) {
  //   const interval = config?.intervalInMs || 1000;

  //   do {
  //     await sleep(interval);

  //     const pools = Array.from(this.pool.keys()).map((poolId) => !this.deleted.has(poolId));

  //     const isEmpty = pools.length === 0;

  //     if (isEmpty) {
  //       continue;
  //     }

  //     const poolIds = pools.join(',');

  //     // fetch pool info from REST
  //     const poolInfos = await this.raydium.api.fetchPoolById({ ids: poolIds });

  //     for (let i = 0; i < poolInfos.length; i++) {
  //       const data = poolInfos[i];
  //       if (data) {
  //         console.log('[poolcahce] get new poolInfo', data);
  //         // @ts-ignore
  //         this.save(data.id, data);
  //       }
  //     }
  //   } while (true);
  // }

  public async getOrFetch(poolId: string): Promise<PoolInfoCacheItem | undefined> {
    if (this.pool.has(poolId)) {
      return this.get(poolId)!;
    }

    const data = await this.fetchFromRPC(poolId);

    if (data) {
      this.save(poolId, data);

      return data;
    }

    return undefined;
  }

  public save(poolId: string, data: PoolInfoCacheItem) {
    // never save stuff which has been deleted.
    if (this.deleted.has(poolId)) {
      return;
    }

    this.pool.set(poolId, data);
  }

  public get(poolId: string): PoolInfoCacheItem | undefined {
    return this.pool.get(poolId);
  }

  public delete(poolId: string) {
    if (this.pool.has(poolId)) {
      this.pool.delete(poolId);
      // because the side-effect in `run()` so it's safely to save deleted PoolId to the Set 
      this.deleted.add(poolId);
    }
  }

  // because fetch from HTTP needs time to sync 
  // so we need to read from onchain directly
  private async fetchFromRPC(poolId: string): Promise<PoolInfoCacheItem | undefined> {
    try {
      const rpcData = await this.raydium.liquidity.getRpcPoolInfo(poolId);
      const poolInfo = toAmmComputePoolInfo({ [poolId]: rpcData });

      return poolInfo[poolId];
    } catch (err) {
      logger.error({
        id: poolId
      }, 'Error while fetching pool Info');
    }

    return undefined;
  }
}
