import { AmmRpcData, AmmV4Keys, ApiV3PoolInfoItem, ApiV3PoolInfoStandardItem, ComputeAmountOutParam, Raydium } from "@raydium-io/raydium-sdk-v2";
import bs58 from 'bs58';

export enum LiquidityPoolStatus {
  Uninitialized,
  Initialized,
  Disabled,
  RemoveLiquidityOnly,
  LiquidityOnly,
  OrderBook,
  Swap,
  WaitingForStart,
}

export function poolStatusToBytes(status: LiquidityPoolStatus): string {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setUint32(0, status, true);

  return bs58.encode(Array.from(new Uint8Array(buffer)));
}
