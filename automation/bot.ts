import { Mutex } from "async-mutex";
import { PoolFilters } from "./filters";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { IConfirmResponse, IExecutor, JitoExecutor } from "../executor";
import { IBotConfig } from "../types/bot.types";
import { logger, sleep } from "../utils";
import { RawAccount, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { Liquidity, LiquidityPoolKeysV4, LiquidityStateV4, Percent, Token, TokenAmount, parseBigNumberish } from "@raydium-io/raydium-sdk";
import { MarketCache, PoolCache } from "../caches";
import { createPoolKeys } from "../utils/pool";
import { WAIT_FOR_RETRY_MS } from "../configs";
import { BN } from "bn.js";
import { DB } from "../db";
import { TrackObject } from "../db/db.types";
import _omit from 'lodash.omit';

export class Bot {
  private readonly poolFilters: PoolFilters;

  // one token at time
  private readonly mutex: Mutex;
  private sellExecutionCount = 0;
  public sellingTokens: TrackObject = {};

  public readonly isJito: boolean = false;

  constructor(
    private readonly connection: Connection,
    private readonly marketCache: MarketCache,
    private readonly poolCache: PoolCache,
    private readonly executor: IExecutor,
    readonly config: IBotConfig,
    private readonly db: DB
  ) {
    this.isJito = executor instanceof JitoExecutor;

    this.mutex = new Mutex();
    this.poolFilters = new PoolFilters(connection, {
      quoteToken: config.quoteToken,
      minPoolSize: config.minPoolSize,
      maxPoolSize: config.maxPoolSize
    });
  }

  async validate(): Promise<boolean> {
    try {
      await getAccount(this.connection, this.config.quoteAta, this.connection.commitment);
    } catch (e) {
      logger.error(`${this.config.quoteToken.symbol} token account not found in wallet: ${this.config.wallet.publicKey.toString()}`);

      return false;
    }

    return true;
  }

  async buy(accountId: PublicKey, poolState: LiquidityStateV4) {
    logger.trace({ mint: poolState.baseMint.toString() }, `Processing new pool...`);

    if (this.config.autoBuyDelay > 0) {
      logger.debug({ mint: poolState.baseMint.toString() }, `Waiting for ${this.config.autoBuyDelay}ms before buying.`);
      await sleep(this.config.autoBuyDelay);
    }

    if (this.config.oneTokenAtATime) {
      if (this.mutex.isLocked() || this.sellExecutionCount > 0) {
        logger.debug({ mint: poolState.baseMint.toString() }, `Skipping buy because one token at a time is turned on and token is being processed already.`);
        return;
      }

      await this.mutex.acquire();
    }

    const match = await this._filterMatch(poolState);

    if (!match) {
      logger.debug({ mint: poolState.baseMint.toString() }, `Skipping buy because pool doesn't match filters`);

      if (this.config.oneTokenAtATime && (this.mutex.isLocked() || this.sellExecutionCount > 0)) {
        // unlock mutex
        this.mutex.release();
      }

      return;
    }

    try {
      const [market, mintATA] = await Promise.all([
        this.marketCache.getOrSet(poolState.marketId.toString()),
        getAssociatedTokenAddress(poolState.baseMint, this.config.wallet.publicKey)
      ]);

      const poolKeys: LiquidityPoolKeysV4 = createPoolKeys(accountId, poolState, market);

      for (let i = 0; i < this.config.maxBuyRetries; i++) {
        try {
          logger.info(
            { mint: poolState.baseMint.toString() },
            `Send buy transaction attempt: ${i + 1}/${this.config.maxBuyRetries}`,
          );

          const tokenOut = new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, poolKeys.baseDecimals);
          const result = await this._swap(
            poolKeys,
            this.config.quoteAta,
            mintATA,
            this.config.quoteToken,
            tokenOut,
            this.config.quoteAmount,
            this.config.buySlippage,
            this.config.wallet,
            'buy'
          );

          if (result.confirmed) {
            // // store markets info
            // await this.db.set<"markets">("markets", {
            //   marketId: poolState.marketId.toBase58(),
            //   baseMint: poolState.baseMint.toBase58(),
            //   poolId: accountId.toString(),
            //   poolOpenTime: poolState.poolOpenTime.toNumber(),
            // }, poolState.baseMint.toBase58());

            logger.info(
              {
                mint: poolState.baseMint.toString(),
                signature: result.signature,
                url: `https://solscan.io/tx/${result.signature}`,
              },
              `Confirmed to buy tx`,
            );

            break;
          }

          logger.error(
            {
              mint: poolState.baseMint.toString(),
              signature: result.signature,
              error: result.error,
            },
            `Error in confirming buy tx`,
          );
        } catch (e) {
          logger.error({ mint: poolState.baseMint.toString(), e }, `[1] Error confirming buy transaction`);
        }
        // walt awhile before retrying
        await sleep(WAIT_FOR_RETRY_MS)
      }
    } catch (e) {
      logger.error({ mint: poolState.baseMint.toString(), e }, `[2] Error confirming buy transaction`);
    } finally {
      if (this.config.oneTokenAtATime) {
        this.mutex.release();
      }
    }
  }

  public async sell(accountId: PublicKey, rawAccount: RawAccount) {
    const poolData = this.poolCache.get(rawAccount.mint.toBase58());

    if (!poolData) {
      logger.trace({ mint: rawAccount.mint.toString() }, `Token pool data is not found, can't sell`);
      return;
    }

    const tokenIn = new Token(TOKEN_PROGRAM_ID, poolData.state.baseMint, poolData.state.baseDecimal.toNumber());
    const tokenAmountIn = new TokenAmount(tokenIn, rawAccount.amount, true);

    if (tokenAmountIn.isZero()) {
      logger.info({ mint: rawAccount.mint.toString() }, `Empty balance, can't sell`);
      return;
    }

    if (this.config.oneTokenAtATime) {
      this.sellExecutionCount++;
    }

    try {
      logger.trace({ mint: rawAccount.mint.toString() }, `Processing selling token...`);

      if (this.config.autoSellDelay > 0) {
        logger.debug({ mint: rawAccount.mint.toString() }, `Waiting for ${this.config.autoSellDelay}ms before sell`);
        await sleep(this.config.autoSellDelay);
      }


      const market = await this.marketCache.getOrSet(poolData.state.marketId.toString());
      const poolKeys: LiquidityPoolKeysV4 = createPoolKeys(
        new PublicKey(poolData.id),
        poolData.state,
        market
      );

      if (this.config.trackSellingTokens && !this.sellingTokens.hasOwnProperty(poolData.state.baseMint.toBase58())) {
        this.sellingTokens = Object.assign({}, this.sellingTokens, {
          [poolData.state.baseMint.toBase58()]: poolData.state.marketId.toBase58()
        });
      }

      await this._priceMatch(tokenAmountIn, poolKeys);

      // if(!matched) {
      //   logger.info({mint: rawAccount.mint.toString()}, "can not get the target price -> Stop fetching.");

      //   if(!this.config.sellAnyway) {
      //     return;
      //   }
      //   logger.info({mint: rawAccount.mint.toString()}, "Sell anyway.");
      // }

      // trying sell even loss (to redeem rent fee)
      for (let i = 0; i < this.config.maxSellRetries; i++) {
        try {
          logger.info(
            { mint: rawAccount.mint.toString() },
            `Send sell transaction attempt: ${i + 1}/${this.config.maxSellRetries}`,
          );

          const result = await this._swap(
            poolKeys,
            accountId,
            this.config.quoteAta,
            tokenIn,
            this.config.quoteToken,
            tokenAmountIn,
            this.config.sellSlippage,
            this.config.wallet,
            'sell'
          );

          if (result.confirmed) {
            // this.onSellCompleted(poolData.state);

            logger.info(
              {
                dex: `https://dexscreener.com/solana/${rawAccount.mint.toString()}?maker=${this.config.wallet.publicKey}`,
                mint: rawAccount.mint.toString(),
                signature: result.signature,
                url: `https://solscan.io/tx/${result.signature}`,
              },
              `Confirmed sell tx`,
            );
            break;
          }

          logger.info(
            {
              mint: rawAccount.mint.toString(),
              signature: result.signature,
              error: result.error,
            },
            `Error confirming sell tx`,
          );
        } catch (e) {
          logger.debug({ mint: rawAccount.mint.toString(), e }, `Error confirming sell transaction`);
        }
      }
    } catch (e) {
      logger.error({ mint: rawAccount.mint.toString(), e }, `Failed to sell token`);
    } finally {
      if (this.config.oneTokenAtATime) {
        this.sellExecutionCount--;
      }
    }
  }

  private async onSellCompleted(poolState: LiquidityStateV4) {
    const baseMint = poolState.baseMint.toBase58();
    // remove markets info
    await this.db.delete("markets", baseMint);

    if (this.config.trackSellingTokens && this.sellingTokens.hasOwnProperty(baseMint)) {
      this.sellingTokens = _omit(this.sellingTokens, [baseMint]);

      // remove trackList if any
      const exists = await this.db.get<"track">("track", baseMint);
      if (!!exists) {
        await this.db.delete("track", poolState.baseMint.toBase58());
      }
    }
  }

  private async _filterMatch(poolState: LiquidityStateV4): Promise<boolean> {
    try {
      const shouldBuy = await this.poolFilters.execute(poolState);

      return shouldBuy;
    } catch (e) {
    }

    return false;
  }

  private async _priceMatch(amountIn: TokenAmount, poolKeys: LiquidityPoolKeysV4) {
    if (this.config.priceCheckDuration === 0 || this.config.priceCheckInterval === 0) {
      return;
    }

    const timesToCheck = this.config.priceCheckDuration / this.config.priceCheckInterval;

    const profitFraction = this.config.quoteAmount.mul(this.config.takeProfit).numerator.div(new BN(100));
    const profitAmount = new TokenAmount(this.config.quoteToken, profitFraction, true);
    const takeProfit = this.config.quoteAmount.add(profitAmount);

    let stopLoss;

    if(this.config.stopLoss){
      const lossFraction = this.config.quoteAmount.mul(this.config.stopLoss).numerator.div(new BN(100));
      const lossAmount = new TokenAmount(this.config.quoteToken, lossFraction, true);
      stopLoss = this.config.quoteAmount.subtract(lossAmount);
    }

    const slippage = new Percent(this.config.sellSlippage, 100);
   
    let timesChecked = 0;

    do {
      try {
        const poolInfo = await Liquidity.fetchInfo({
          connection: this.connection,
          poolKeys
        });

        const { amountOut, currentPrice } = Liquidity.computeAmountOut({
          poolKeys,
          poolInfo,
          amountIn,
          currencyOut: this.config.quoteToken,
          slippage
        });

        if (amountOut.gt(takeProfit) || (this.config.stopLoss && amountOut.lt(stopLoss as TokenAmount))) {
          logger.warn(
            { mint: poolKeys.baseMint.toString() },
            `Prepare a sell for Taking profit at: ${takeProfit.toFixed()} | Stop loss: ${stopLoss?.toFixed() || 0} | Current: ${amountOut.toFixed()}`,
          );
          break;
        }

        await sleep(this.config.priceCheckInterval);
      } catch (e) {
        logger.error({ mint: poolKeys.baseMint.toString(), e }, `Failed to check token price`);
      } finally {
        timesChecked++;
      }
    } while (timesChecked < timesToCheck);
  }


  private async _swap(
    poolKeys: LiquidityPoolKeysV4,
    ataIn: PublicKey,
    ataOut: PublicKey,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: TokenAmount,
    slippage: number,
    wallet: Keypair,
    direction: 'buy' | 'sell'
  ): Promise<IConfirmResponse> {
    const slippagePercent = new Percent(slippage, 100);
    const poolInfo = await Liquidity.fetchInfo({
      connection: this.connection,
      poolKeys
    });

    const computedAmountOut = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut: tokenOut,
      slippage: slippagePercent
    });

    const lastestBlockHash = await this.connection.getLatestBlockhash(this.connection.commitment);

    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction({
      amountIn: amountIn.raw,
      minAmountOut: computedAmountOut.minAmountOut.raw,
      poolKeys,
      userKeys: {
        tokenAccountIn: ataIn,
        tokenAccountOut: ataOut,
        owner: wallet.publicKey
      }
    }, poolKeys.version);

    const swapInstruction = this.isJito ? [] : [
      ComputeBudgetProgram.setComputeUnitLimit({ units: this.config.unitLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.config.unitPrice })
    ];

    const buyInstruction = direction === 'buy' ? [
      createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        ataOut,
        wallet.publicKey,
        tokenOut.mint
      )
    ] : [];

    const sellInstruction = direction === 'sell' ? [
      createCloseAccountInstruction(ataIn, wallet.publicKey, wallet.publicKey)
    ] : [];


    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: lastestBlockHash.blockhash,
      instructions: [
        ...swapInstruction,
        ...buyInstruction,
        ...innerTransaction.instructions,
        ...sellInstruction
      ]
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet, ...innerTransaction.signers]);

    return this.executor.execAndConfirm(transaction, wallet, lastestBlockHash);
  }
}