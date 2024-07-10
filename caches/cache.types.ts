import { ComputeAmountOutParam } from "@raydium-io/raydium-sdk-v2";

export type PoolInfoCacheItem = ComputeAmountOutParam["poolInfo"];

export interface IPoolCacheItem {
  poolId: string;
  marketId: string;
  baseMint: string;
  baseDecimal: number;
}