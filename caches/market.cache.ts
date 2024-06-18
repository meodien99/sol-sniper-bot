import { MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from "@raydium-io/raydium-sdk";
import { MINIMAL_MARKET_STATE_LAYOUT_V3, MinimalMarketLayoutV3, getMinimalMarketV3 } from "../utils/market";
import { logger } from "../utils";
import { Connection, PublicKey } from "@solana/web3.js";

export class MarketCache {
  private readonly keys: Map<string, MinimalMarketLayoutV3> = new Map<string, MinimalMarketLayoutV3>();

  constructor(private readonly connection: Connection) { }

  async init(config: { quoteToken: Token }) {
    logger.debug({}, `Fetching all existing ${config.quoteToken.symbol} markets....`);

    const accounts = await this.connection.getProgramAccounts(MAINNET_PROGRAM_ID.OPENBOOK_MARKET, {
      commitment: this.connection.commitment,
      dataSlice: {
        offset: MARKET_STATE_LAYOUT_V3.offsetOf('eventQueue'),
        length: MINIMAL_MARKET_STATE_LAYOUT_V3.span
      },
      filters: [
        { dataSize: MARKET_STATE_LAYOUT_V3.span },
        {
          memcmp: {
            offset: MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
            bytes: config.quoteToken.mint.toBase58()
          }
        }
      ],
    });

    for (const account of accounts) {
      const market = MINIMAL_MARKET_STATE_LAYOUT_V3.decode(account.account.data);
      const marketId = account.pubkey.toString();
      this.keys.set(marketId, market);
    }

    logger.debug({}, `Cached ${this.keys.size} markets`);
  }

  public save(marketId: string, keys: MinimalMarketLayoutV3) {
    if(!this.keys.has(marketId)) {
      logger.trace({}, `Caching new market: ${marketId}`);
      this.keys.set(marketId, keys);
    }
  }

  public async get(marketId: string): Promise<MinimalMarketLayoutV3> {
    if(this.keys.has(marketId)) {
      return this.keys.get(marketId)!;
    }

    logger.trace({}, `Fetching new market keys for ${marketId}`);
    
    const market = await this._fetch(marketId);
    this.keys.set(marketId, market);

    return market;
  }

  private _fetch(marketId: string): Promise<MinimalMarketLayoutV3> {
    return getMinimalMarketV3(this.connection, new PublicKey(marketId), this.connection.commitment);
  }
}