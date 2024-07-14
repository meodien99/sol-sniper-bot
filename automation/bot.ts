import { Mutex } from "async-mutex";
import { PoolFilters } from "./filters";
import { Connection } from "@solana/web3.js";
import { IConfirmResponse, IExecutor, JitoExecutor } from "../executor";
import { IBotConfig } from "../types/bot.types";
import { logger, sleep } from "../utils";
import { RawAccount, getAccount } from "@solana/spl-token";
import { AmmRpcData, ApiV3PoolInfoStandardItem, ComputeAmountOutParam, LiquidityStateV4, Raydium, TokenAmount, TxVersion, parseBigNumberish, toAmmComputePoolInfo } from "@raydium-io/raydium-sdk-v2";
import { PoolCache } from "../caches";
import { WAIT_FOR_RETRY_MS } from "../configs";
import BN from "bn.js";
import { DB } from "../db";
import { TrackObject } from "../db/db.types";
import _omit from 'lodash.omit';
import { toDecimalPlaces } from "../utils/number";

export class Bot {
  private readonly poolFilters: PoolFilters;

  // one token at time
  private readonly mutex: Mutex;
  private sellExecutionCount = 0;
  public sellingTokens: TrackObject = {};

  public readonly isJito: boolean = false;

  constructor(
    private readonly connection: Connection,
    private readonly poolCache: PoolCache,
    private readonly raydium: Raydium,
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

  async buy(accountId: string, poolState: LiquidityStateV4) {
    if (this.config.autoBuyDelay > 0) {
      // logger.debug({ mint: poolState.baseMint.toString() }, `Waiting for ${this.config.autoBuyDelay}ms before buying.`);
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
      const inputMint = this.config.quoteToken.mint.toBase58();
      const amountIn = this.config.quoteAmount.raw.toNumber();

      for (let i = 0; i < this.config.maxBuyRetries; i++) {
        const attempt = `${i + 1}/${this.config.maxBuyRetries}`;
        try {
          logger.info(
            { mint: poolState.baseMint.toString() },
            `Send buy transaction attempt: ${attempt}`,
          );

          const result = await this.swap(
            accountId,
            inputMint,
            amountIn,
            this.config.buySlippage
          );

          if (result.confirmed) {
            // // store markets info
            // await this.db.set<"markets">("markets", {
            //   marketId: poolState.marketId.toBase58(),
            //   baseMint: poolState.baseMint.toBase58(),
            //   poolId: accountId.toString(),
            //   poolOpenTime: poolState.poolOpenTime.toNumber(),
            // }, poolState.baseMint.toBase58());

            // because onProgramChange makes latency while listening sometimes.
            // so it's better to call sell() immediately after buying.
            logger.info({
              dex: `https://dexscreener.com/solana/${poolState.baseMint.toString()}?maker=${this.config.wallet.publicKey}`,
              mint: poolState.baseMint.toString(),
              signature: result.signature,
              url: `https://solana.fm/tx/${result.signature}?cluster=mainnet-alpha&origin=solflare`,
            }, `[BUY] Confirmed buy tx`);

            break;
          }

          logger.error({
            mint: poolState.baseMint.toString(),
            signature: result.signature,
            error: result.error,
          }, `[BUY][ERROR] Error in confirming buy tx at attemp: ${attempt}`);
        } catch (e: any) {
          logger.error({
            mint: poolState.baseMint.toString(),
            e
          }, `[BUY][ERROR][1] Error confirming buy transaction attempt: ${attempt}`);

          if (e instanceof Error && e.message === "INSUSPECTED_RUGPULL") {
            logger.error({
              mint: poolState.baseMint.toString(),
              e
            }, `[BUY][ERROR][INSUSPECTED] Break buying because of insuspect rug.`);
            break;
          }
        }

        // walt awhile before retrying
        await sleep(WAIT_FOR_RETRY_MS)
      }
    } catch (e) {
      logger.error({ mint: poolState.baseMint.toString(), e }, `[BUY][ERROR][2] Error confirming buy transaction`);
    } finally {
      if (this.config.oneTokenAtATime) {
        this.mutex.release();
      }
    }
  }

  public async sell(rawAccount: RawAccount) {
    const poolData = this.poolCache.get(rawAccount.mint.toBase58());

    if (!poolData) {
      logger.trace({ mint: rawAccount.mint.toString() }, `Token pool data is not found, can't sell`);
      return;
    }
    const poolId = poolData.poolId;

    const amountIn = parseBigNumberish(rawAccount.amount)
    if (amountIn.isZero()) {
      logger.info({ mint: rawAccount.mint.toString() }, `Empty balance, can't sell`);
      return;
    }

    if (this.config.oneTokenAtATime) {
      this.sellExecutionCount++;
    }

    try {
      logger.trace({ mint: rawAccount.mint.toString() }, `Processing selling token...`);

      if (this.config.autoSellDelay > 0) {
        // logger.debug({ mint: rawAccount.mint.toString() }, `Waiting for ${this.config.autoSellDelay}ms before sell`);
        await sleep(this.config.autoSellDelay);
      }

      const matched = await this._priceMatch(poolId, amountIn.toNumber());

      if (!matched) {
        logger.warn({ mint: rawAccount.mint.toString() }, "[SELL][UNMATCH] can not get the target price in time -> Stop fetching but sell anyway.");
      }

      // trying sell even loss (to redeem rent fee)
      for (let i = 0; i < this.config.maxSellRetries; i++) {
        try {
          const attempt = `${i + 1}/${this.config.maxSellRetries}`;

          logger.info(
            { mint: rawAccount.mint.toString() },
            `Send sell transaction attempt: ${attempt}`,
          );

          const inputMint = rawAccount.mint.toString();

          const result = await this.swap(
            poolId,
            inputMint,
            amountIn.toNumber(),
            this.config.sellSlippage
          );

          if (result.confirmed) {
            // this.onSellCompleted(poolData.state);

            logger.info(
              {
                dex: `https://dexscreener.com/solana/${rawAccount.mint.toString()}?maker=${this.config.wallet.publicKey}`,
                mint: rawAccount.mint.toString(),
                signature: result.signature,
                url: `https://solana.fm/tx/${result.signature}?cluster=mainnet-alpha&origin=solflare`,
              },
              `[SELL] Confirmed sell tx`,
            );
            return true;
          }

          logger.info(
            {
              mint: rawAccount.mint.toString(),
              signature: result.signature,
              error: result.error,
            },
            `Error confirming sell tx at attempt: ${attempt}`,
          );
        } catch (e) {
          logger.debug({ mint: rawAccount.mint.toString(), e }, `Error confirming sell transaction`);
        }
      }
    } catch (e) {
      logger.error({ mint: rawAccount.mint.toString(), e }, `[2] Failed to sell token`);
    } finally {

      if (this.config.oneTokenAtATime) {
        this.sellExecutionCount--;
      }
    }

    return false;
  }

  // private async onSellCompleted(poolState: LiquidityStateV4) {
  //   const baseMint = poolState.baseMint.toBase58();
  //   // remove markets info
  //   await this.db.delete("markets", baseMint);

  //   if (this.config.trackSellingTokens && this.sellingTokens.hasOwnProperty(baseMint)) {
  //     this.sellingTokens = _omit(this.sellingTokens, [baseMint]);

  //     // remove trackList if any
  //     const exists = await this.db.get<"track">("track", baseMint);
  //     if (!!exists) {
  //       await this.db.delete("track", poolState.baseMint.toBase58());
  //     }
  //   }
  // }

  private async _filterMatch(poolState: LiquidityStateV4): Promise<boolean> {
    try {
      const shouldBuy = await this.poolFilters.execute(poolState);

      return shouldBuy;
    } catch (e) {
    }

    return false;
  }

  private async _priceMatch(poolId: string, amountIn: number): Promise<boolean> {
    if (this.config.priceCheckDuration === 0 || this.config.priceCheckInterval === 0) {
      return false;
    }

    const timesToCheck = this.config.priceCheckDuration / this.config.priceCheckInterval;

    const profitFraction = this.config.quoteAmount.mul(this.config.takeProfit).numerator.div(new BN(100));
    const profitAmount = new TokenAmount(this.config.quoteToken, profitFraction, true);
    const takeProfit = this.config.quoteAmount.add(profitAmount);

    let stopLoss;

    if (this.config.stopLoss) {
      const lossFraction = this.config.quoteAmount.mul(this.config.stopLoss).numerator.div(new BN(100));
      const lossAmount = new TokenAmount(this.config.quoteToken, lossFraction, true);
      stopLoss = this.config.quoteAmount.subtract(lossAmount);
    }

    let timesChecked = 0;

    do {
      try {
        const rpcData = await this.raydium.liquidity.getRpcPoolInfo(poolId);
        const computeData = toAmmComputePoolInfo({ [poolId]: rpcData });
        const poolInfo = computeData[poolId];

        const inputMint = poolInfo.mintA.address; // calculate selling token A for amount of token B

        const { amountOut, minAmountOut } = await this.computedAmoutOut(
          rpcData,
          poolInfo,
          inputMint,
          amountIn,
          this.config.sellSlippage
        )

        if (amountOut.gt(takeProfit.raw) || (stopLoss && amountOut.lt(stopLoss.raw))) {
          logger.trace(
            { mint: poolInfo.mintA.address },
            `[SELL][MATCHED] Taking profit at: ${takeProfit.toFixed()} | Stop loss: ${stopLoss?.toFixed() || 0} | 
            amountOut: ${toDecimalPlaces(amountOut.toString(), poolInfo.mintB.decimals)}, minAmountOut: ${toDecimalPlaces(minAmountOut.toString(), poolInfo.mintB.decimals)}`,
          );
          return true;
        }

        await sleep(this.config.priceCheckInterval);
      } catch (e) {
        logger.error({
          poolId,
          e
        }, `Failed to check token price`);
      } finally {
        timesChecked++;
      }
    } while (timesChecked < timesToCheck);

    return true;
  }

  private async computedAmoutOut(
    rpcData: AmmRpcData,
    poolInfo: ComputeAmountOutParam["poolInfo"],
    inputMint: string, // native_mint (ex WSOL) means buy, mintA means sell
    amountIn: number,
    slippage: number,
    showLog?: boolean
  ): Promise<{
    amountOut: BN,
    minAmountOut: BN
  }> {
    const baseIn = inputMint === poolInfo.mintA.address;
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];
    const slippagePercent = slippage / 100;

    const computedAmountOut = this.raydium.liquidity.computeAmountOut({
      poolInfo: {
        ...poolInfo as ApiV3PoolInfoStandardItem,
        baseReserve: rpcData.baseReserve,
        quoteReserve: rpcData.quoteReserve,
        status: rpcData.status.toNumber(),
        version: 4,
      },
      amountIn: new BN(amountIn),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: slippagePercent
    });

    if (showLog) {
      logger.info(
        `computed swap ${toDecimalPlaces(amountIn, mintIn.decimals)} ${mintIn.symbol || mintIn.address} to ${toDecimalPlaces(computedAmountOut.amountOut.toString(), mintOut.decimals)} 
        ${mintOut.symbol || mintOut.address}, minimum amount out ${toDecimalPlaces(computedAmountOut.minAmountOut.toString(), mintOut.decimals)} ${mintOut.symbol || mintOut.address}`
      )
    }

    return {
      amountOut: computedAmountOut.amountOut,
      minAmountOut: computedAmountOut.minAmountOut
    }
  }

  private async swap(
    poolId: string,
    inputMint: string,
    amountIn: number,
    slippage: number,
  ): Promise<IConfirmResponse> {
    try {
      const { poolRpcData: rpcData, poolKeys, poolInfo } = await this.raydium.liquidity.getPoolInfoFromRpc({ poolId });
      const baseIn = inputMint === poolInfo.mintA.address;
      const mintIn = baseIn ? poolInfo.mintA : poolInfo.mintB;

      // rpc data
      const { minAmountOut } = await this.computedAmoutOut(
        rpcData,
        poolInfo,
        inputMint,
        amountIn,
        slippage,
        true
      );

      // check pool amount is less than minPoolSize so it might be rugged.
      // just inspect for the buy side only
      if (!baseIn && rpcData.mintBAmount.lt(this.config.minPoolSize.raw)) {
        throw new Error('INSUSPECTED_RUGPULL');
      }

      const { execute } = await this.raydium.liquidity.swap({
        poolInfo,
        poolKeys,
        amountIn: new BN(amountIn),
        amountOut: minAmountOut, // out.amountOut means amount 'without' slippage
        fixedSide: 'in',
        inputMint: mintIn.address,
        txVersion: TxVersion.V0,
        // optional: set up token account
        config: {
          inputUseSolBalance: false, // default: true, if you want to use existed wsol token account to pay token in, pass false
          outputUseSolBalance: false, // default: true, if you want to use existed wsol token account to receive token out, pass false
          associatedOnly: false, // default: true, if you want to use ata only, pass true
        },

        // optional: set up priority fee here
        computeBudgetConfig: {
          units: this.config.unitLimit,
          microLamports: this.config.unitPrice,
        },
      });

      const lastestBlockHash = await this.connection.getLatestBlockhash({
        commitment: this.connection.commitment,
      });

      const { txId, signedTx } = await execute({ skipPreflight: true });

      if (this.isJito) {
        return this.executor.execAndConfirm(signedTx, lastestBlockHash, this.config.wallet);
      } else {
        return this.executor.execAndConfirm(txId, lastestBlockHash)
      }
    } catch (e: any) {
      throw Error(`ERROR ${e.toString()}`);
    }
  }
}