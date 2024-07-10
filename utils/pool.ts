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

export async function getPoolKeys(
  raydium: Raydium,
  rpcData: AmmRpcData,
  poolInfo: ComputeAmountOutParam["poolInfo"],
): Promise<AmmV4Keys> {
  const keys = await raydium.tradeV2.computePoolToPoolKeys({
    pools: [poolInfo],
    ammRpcData: { [poolInfo.id]: rpcData },
  });

  return keys[0] as AmmV4Keys;
}

export async function getRpcPoolInfo(
  raydium: Raydium,
  poolId: string,
): Promise<AmmRpcData> {
  return await raydium.liquidity.getRpcPoolInfo(poolId)
}