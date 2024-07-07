import { LIQUIDITY_STATE_LAYOUT_V4, LiquidityStateV4, MAINNET_PROGRAM_ID, Token } from "@raydium-io/raydium-sdk";
import { logger } from "../utils";
import { Connection, PublicKey } from "@solana/web3.js";
import { DB } from "../db";

export interface IPoolCacheItem {
  id: string;
  state: LiquidityStateV4
}

interface InitItem {
  baseMint: string;
  marketId: string;
}

export class PoolCache {
  private readonly keys: Map<string, IPoolCacheItem> = new Map<string, IPoolCacheItem>(); // <baseMint, IPoolCacheItem>
  constructor(private readonly connection: Connection) { }

  async load(lists: InitItem[], db: DB, config: { quoteToken: Token }) {
    if (lists.length) {
      for (let i = 0; i < lists.length; i++) {
        const { baseMint, marketId } = lists[i];

        // get pool states
        const accounts = await this.connection.getProgramAccounts(MAINNET_PROGRAM_ID.AmmV4, {
          commitment: this.connection.commitment,
          filters: [
            { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
            {
              memcmp: {
                offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
                bytes: config.quoteToken.mint.toBase58(),
              }
            },
            {
              memcmp: {
                offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('baseMint'),
                bytes: new PublicKey(baseMint).toBase58(),
              }
            },
            {
              memcmp: {
                offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketId'),
                bytes: new PublicKey(marketId).toBase58(),
              }
            },
          ]
        });

        if (accounts.length) {
          // only take the first response
          const accountInfo = accounts[0];
          const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(accountInfo.account.data);
          // to ensure we're using the right id.
          const poolId = (await db.get<"markets">("markets", poolState.baseMint.toBase58()))?.poolId || accountInfo.pubkey.toBase58();

          this.save(poolId, poolState);
        }
      }
    }
  }

  public save(id: string, state: LiquidityStateV4) {
    if (!this.keys.has(state.baseMint.toBase58())) {
      logger.trace(`Caching new pool for mint: ${state.baseMint.toString()}`);

      this.keys.set(state.baseMint.toBase58(), { id, state })
    }
  }

  public get(mint: string): IPoolCacheItem | undefined {
    return this.keys.get(mint);
  }
}