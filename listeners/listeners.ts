import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from "@raydium-io/raydium-sdk";
import { Connection, GetProgramAccountsFilter, ProgramAccountChangeCallback, PublicKey } from "@solana/web3.js";
import EventEmitter from "events";
import { OPEN_BOOK_SUBSCRIPTION_EVENT, POOL_SUBSCRIPTION_EVENT, WALLET_CHANGES_SUBSCRIPTION_EVENT } from "./listeners.events";
import bs58 from 'bs58';
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export interface IListenersStartConfig {
  walletPublicKey: PublicKey;
  quoteToken: Token;
  autoSell: boolean;
  cacheNewMarkets: boolean;
}

export class Listeners extends EventEmitter {
  private subcriptions: number[] = [];

  constructor(private readonly connection: Connection) {
    super();
  }

  public async start(config: IListenersStartConfig) {
    if (config.cacheNewMarkets) {
      const openBookSubscription = await this._subscribeToOpenBookMarkets(config);
      this.subcriptions.push(openBookSubscription);
    }

    const raydiumSubscription = await this._subscribeToRaydiumPools(config);
    this.subcriptions.push(raydiumSubscription);

    if(config.autoSell) {
      const walletSubscription = await this._subscribeToWalletChanges(config);
      this.subcriptions.push(walletSubscription);
    }
  }

  public async stop() {
    for(let i = this.subcriptions.length; i >= 0; --i) {
      const subcription = this.subcriptions[i];
      await this.connection.removeAccountChangeListener(subcription);
      this.subcriptions.splice(i, 1);
    }
  }

  private async _subscribeToOpenBookMarkets(config: IListenersStartConfig): Promise<number> {
    const callback: ProgramAccountChangeCallback = async (updatedAccountInfo) => {
      this.emit(OPEN_BOOK_SUBSCRIPTION_EVENT, updatedAccountInfo)
    };

    const filters: GetProgramAccountsFilter[] = [
      { dataSize: MARKET_STATE_LAYOUT_V3.span },
      {
        memcmp: {
          offset: MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
          bytes: config.quoteToken.mint.toBase58(),
        }
      }
    ];

    return this.connection.onProgramAccountChange(
      MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
      callback,
      this.connection.commitment,
      filters
    );
  }

  private async _subscribeToRaydiumPools(config: IListenersStartConfig): Promise<number> {
    const callback: ProgramAccountChangeCallback = async (updatedAccountInfo) => {
      this.emit(POOL_SUBSCRIPTION_EVENT, updatedAccountInfo)
    };

    const filters: GetProgramAccountsFilter[] = [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
          bytes: config.quoteToken.mint.toBase58(),
        }
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
          bytes: MAINNET_PROGRAM_ID.OPENBOOK_MARKET.toBase58(),
        }
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('status'),
          bytes: bs58.encode([6, 0, 0, 0, 0, 0, 0, 0]),
        },
      },
    ];

    return this.connection.onProgramAccountChange(
      MAINNET_PROGRAM_ID.AmmV4,
      callback,
      this.connection.commitment,
      filters
    );
  }

  private async _subscribeToWalletChanges(config: IListenersStartConfig): Promise<number> {
    const callback: ProgramAccountChangeCallback = async (updatedAccountInfo) => {
      this.emit(WALLET_CHANGES_SUBSCRIPTION_EVENT, updatedAccountInfo)
    };

    const filters: GetProgramAccountsFilter[] = [
      { dataSize: 165 },
      {
        memcmp: {
          offset: 32,
          bytes: config.walletPublicKey.toBase58(),
        }
      }
    ];

    return this.connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      callback,
      this.connection.commitment,
      filters
    );
  }
}