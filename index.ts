import { Connection, KeyedAccountInfo, Keypair } from "@solana/web3.js";
import { AUTO_BUY_DELAY, AUTO_SELL, AUTO_SELL_DELAY, BUY_SLIPPAGE, CHECK_IF_BURNED, CHECK_IF_FREEZABLE, CHECK_IF_MINT_IS_RENOUNCED, COMMITMENT_LEVEL, COMPUTE_UNIT_LIMIT, COMPUTE_UNIT_PRICE, CUSTOM_FEE, LOG_LEVEL, MAX_BUY_RETRIES, MAX_POOL_SIZE, MAX_SELL_RETRIES, MIN_LP_BURNED_PERCENT, MIN_POOL_SIZE, ONE_TOKEN_AT_A_TIME, USE_TRACK_LIST, PRICE_CHECK_DURATION, PRICE_CHECK_INTERVAL, PRIVATE_KEY, QUOTE_AMOUNT, QUOTE_MINT, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SELL_SLIPPAGE, STOP_LOSS, TAKE_PROFIT, TRANSACTION_EXECUTOR, TRACK_SELLING_TOKENS_ON_EXIT, TRACK_ITEMS_LIMIT, CHECK_IF_MUTABLE, CHECK_IF_SOCIALS } from "./configs";
import { getWallet, logger, sleep } from "./utils";
import { LIQUIDITY_STATE_LAYOUT_V4, SPL_MINT_LAYOUT, TOKEN_PROGRAM_ID, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import { Bot } from "./automation/bot";
import { version } from './package.json';
import { getToken } from "./utils/token";
import { IBotConfig } from "./types/bot.types";
import { AccountLayout, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { MarketCache, PoolCache } from "./caches";
import { DefaultExecutor, JitoExecutor } from "./executor";
import { Listeners, POOL_SUBSCRIPTION_EVENT, PREPARE_FOR_SELLING_EVENT } from "./listeners";
import beforeShutdown from "./utils/before-shutdown";
import { DB } from "./db";

function printDetails(wallet: Keypair, quoteToken: Token, bot: Bot) {
  logger.info(`Bot Version: ${version} `);

  const botConfig = bot.config;

  logger.info('------- CONFIGURATION START -------');
  logger.info(`Wallet: ${wallet.publicKey.toString()}`);

  logger.info('--=== General Bot ===--');

  logger.info(
    `Using ${TRANSACTION_EXECUTOR} executer: ${bot.isJito || (TRANSACTION_EXECUTOR === 'default' ? true : false)}`,
  );
  if (bot.isJito) {
    logger.info(`${TRANSACTION_EXECUTOR} fee: ${CUSTOM_FEE}`);
  } else {
    logger.info(`Compute Unit limit: ${botConfig.unitLimit}`);
    logger.info(`Compute Unit price (micro lamports): ${botConfig.unitPrice}`);
  }

  logger.info(`Single token at the time: ${botConfig.oneTokenAtATime}`);
  logger.info(`Use Track list: ${USE_TRACK_LIST}`);
  logger.info(`Tracked items limits: ${TRACK_ITEMS_LIMIT}`);
  logger.info(`Track tokens on selling: ${TRACK_SELLING_TOKENS_ON_EXIT}`);

  logger.info(`Log level: ${LOG_LEVEL}`);

  logger.info('--=== Buy ===--');
  logger.info(`Buy amount: ${botConfig.quoteAmount.toFixed()} ${botConfig.quoteToken.name}`);
  logger.info(`Auto buy delay: ${botConfig.autoBuyDelay} ms`);
  logger.info(`Max buy retries: ${botConfig.maxBuyRetries}`);
  logger.info(`Buy amount (${quoteToken.symbol}): ${botConfig.quoteAmount.toFixed()}`);
  logger.info(`Buy slippage: ${botConfig.buySlippage}%`);

  logger.info('--=== Sell ===--');
  logger.info(`Auto sell: ${AUTO_SELL}`);
  logger.info(`Auto sell delay: ${botConfig.autoSellDelay} ms`);
  logger.info(`Max sell retries: ${botConfig.maxSellRetries}`);
  logger.info(`Sell slippage: ${botConfig.sellSlippage}%`);
  logger.info(`Price check interval: ${botConfig.priceCheckInterval} ms`);
  logger.info(`Price check duration: ${botConfig.priceCheckDuration} ms`);
  logger.info(`Take profit: ${botConfig.takeProfit}%`);
  logger.info(`Stop loss: ${botConfig.stopLoss}%`);

  logger.info('--=== Token Filters ===--');
  logger.info(`Check renounced: ${CHECK_IF_MINT_IS_RENOUNCED}`);
  logger.info(`Check freezable: ${CHECK_IF_FREEZABLE}`);
  logger.info(`Check mutable: ${CHECK_IF_MUTABLE}`);
  logger.info(`Check has social: ${CHECK_IF_SOCIALS}`);
  logger.info(`Check burned: ${CHECK_IF_BURNED}`);
  logger.info(`Min LP Burned percent: ${MIN_LP_BURNED_PERCENT}%`);
  logger.info(`Min pool size: ${botConfig.minPoolSize.toFixed()}`);
  logger.info(`Max pool size: ${botConfig.maxPoolSize.toFixed()}`);

  logger.info('------- CONFIGURATION END -------');

  logger.info('Bot is running! Press CTRL + C to stop it.');
}

const wallet = getWallet(PRIVATE_KEY.trim());
const quoteToken = getToken(QUOTE_MINT);

const botConfig: IBotConfig = {
  wallet,
  quoteAta: getAssociatedTokenAddressSync(quoteToken.mint, wallet.publicKey),
  minPoolSize: new TokenAmount(quoteToken, MIN_POOL_SIZE, false),
  maxPoolSize: new TokenAmount(quoteToken, MAX_POOL_SIZE, false),
  quoteToken,
  quoteAmount: new TokenAmount(quoteToken, QUOTE_AMOUNT, false),
  oneTokenAtATime: ONE_TOKEN_AT_A_TIME,
  autoSell: AUTO_SELL,
  autoSellDelay: AUTO_SELL_DELAY,
  maxSellRetries: MAX_SELL_RETRIES,
  autoBuyDelay: AUTO_BUY_DELAY,
  maxBuyRetries: MAX_BUY_RETRIES,
  unitLimit: COMPUTE_UNIT_LIMIT,
  unitPrice: COMPUTE_UNIT_PRICE,
  takeProfit: TAKE_PROFIT,
  stopLoss: STOP_LOSS,
  buySlippage: BUY_SLIPPAGE,
  sellSlippage: SELL_SLIPPAGE,
  priceCheckInterval: PRICE_CHECK_INTERVAL,
  priceCheckDuration: PRICE_CHECK_DURATION,
  trackSellingTokens: TRACK_SELLING_TOKENS_ON_EXIT
};

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: COMMITMENT_LEVEL,
});

const getTokenAccounts = async (connection: Connection, listeners: Listeners, poolCache: PoolCache) => {
  //get accounts from wallets
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    commitment: connection.commitment,
    filters: [
      { dataSize: 165 },
      {
        memcmp: {
          offset: 32,
          bytes: wallet.publicKey.toBase58(),
        }
      }
    ]
  });

  if (accounts.length) {
    for (let i = 0; i < accounts.length; i++) {
      const payload = accounts[i];
      const accountInfo = AccountLayout.decode(payload.account.data);

      if (accountInfo.mint.equals(quoteToken.mint)) {
        continue;
      }

      if (poolCache.has(accountInfo.mint.toBase58())) {
        listeners.emit(PREPARE_FOR_SELLING_EVENT, accountInfo);
        await sleep(500);
      }
    }
  }
}

const run = async (db: DB) => {
  logger.level = LOG_LEVEL;
  logger.info('Starting bot ....');

  const marketCache = new MarketCache(connection);
  const poolCache = new PoolCache(connection);
  let txExecutor;

  if (TRANSACTION_EXECUTOR === 'jito') {
    txExecutor = new JitoExecutor(connection, CUSTOM_FEE);
  } else {
    txExecutor = new DefaultExecutor(connection)
  }

  const bot = new Bot(connection, marketCache, poolCache, txExecutor, botConfig, db);

  const isValid = await bot.validate();

  if (!isValid) {
    logger.info('Bot is exiting...');
    process.exit(1);
  }


  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  const listeners = new Listeners(connection);

  await listeners.start({
    walletPublicKey: wallet.publicKey,
    quoteToken,
    autoSell: AUTO_SELL,
  });

  listeners.on(POOL_SUBSCRIPTION_EVENT, async (updatedAccountInfo: KeyedAccountInfo) => {
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
    const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
    const exists = poolCache.get(poolState.baseMint.toBase58());

    if (!exists && poolOpenTime > runTimestamp) {
      poolCache.save(updatedAccountInfo.accountId.toString(), poolState);

      await bot.buy(updatedAccountInfo.accountId, poolState);
    }
  });

  listeners.on(PREPARE_FOR_SELLING_EVENT, async (updatedAccountInfo: KeyedAccountInfo) => {
    const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo.data);
    if (accountData.mint.equals(quoteToken.mint)) {
      return;
    }

    logger.info({ baseMint: accountData.mint.toBase58() }, "PREPARE_FOR_SELLING_EVENT")

    await bot.sell(updatedAccountInfo.accountId, accountData);
  });

  if (USE_TRACK_LIST) {
    // init all caches for later use.
    let trackLists = await db.getCollection<"track">("track");

    if (trackLists) {
      const baseMints = Object.keys(trackLists).slice(0, TRACK_ITEMS_LIMIT);

      const markets = baseMints.map((baseMint) => (trackLists[baseMint]));
      await marketCache.load(markets);

      const limitedMints = baseMints.map((baseMint) => ({
        baseMint,
        marketId: trackLists[baseMint]
      }));

      await poolCache.load(limitedMints, db, { quoteToken });

      await getTokenAccounts(connection, listeners, poolCache);
    }
  }

  printDetails(wallet, quoteToken, bot);

  // register trapping before shuting down
  if (USE_TRACK_LIST && TRACK_SELLING_TOKENS_ON_EXIT) {
    const onInterrupt = async () => {
      // store current selling tokens to the trackList
      const neededTrackTokens = Object.keys(bot.sellingTokens);

      if (neededTrackTokens.length) {
        let tokens = {};

        for (let i = 0; i < neededTrackTokens.length; i++) {
          const baseMint = neededTrackTokens[i];
          const marketId = bot.sellingTokens[baseMint]

          tokens = Object.assign({}, tokens, {
            [baseMint]: marketId
          });
        }

        await db.assigns("track", tokens);
      }
    }

    beforeShutdown(onInterrupt)
  }
}

// init db
const db = new DB('store/db.json');

db.on('ready', () => {
  run(db);
});