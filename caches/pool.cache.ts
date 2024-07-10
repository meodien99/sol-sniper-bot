import { logger } from "../utils";
import { IPoolCacheItem } from "./cache.types";

export class PoolCache {
  private readonly keys: Map<string, IPoolCacheItem> = new Map<string, IPoolCacheItem>(); // <baseMint, IPoolCacheItem>
  constructor() { }

  public save(mint: string, data: IPoolCacheItem) {

    if (!this.keys.has(mint)) {
      logger.trace(`Caching new pool for mint: ${mint}`);
      this.keys.set(mint, data);
    }
  }

  public get(mint: string): IPoolCacheItem | undefined {
    return this.keys.get(mint);
  }

  public has(mint: string): boolean {
    return this.keys.has(mint);
  }

  public delete(mint: string) {
    if (this.keys.has(mint)) {
      this.keys.delete(mint);
    }
  }
}