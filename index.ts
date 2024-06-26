import { Connection, KeyedAccountInfo, Keypair } from "@solana/web3.js";
import { AUTO_BUY_DELAY, AUTO_SELL, AUTO_SELL_DELAY, BUY_SLIPPAGE, CACHE_NEW_MARKETS, CHECK_IF_BURNED, CHECK_IF_FREEZABLE, CHECK_IF_MINT_IS_RENOUNCED, COMMITMENT_LEVEL, COMPUTE_UNIT_LIMIT, COMPUTE_UNIT_PRICE, CUSTOM_FEE, LOG_LEVEL, MAX_BUY_RETRIES, MAX_POOL_SIZE, MAX_SELL_RETRIES, MIN_LP_BURNED_PERCENT, MIN_POOL_SIZE, ONE_TOKEN_AT_A_TIME, PRE_LOAD_EXISTING_MARKETS, PRICE_CHECK_DURATION, PRICE_CHECK_INTERVAL, PRIVATE_KEY, QUOTE_AMOUNT, QUOTE_MINT, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SELL_SLIPPAGE, STOP_LOSS, TAKE_PROFIT, TRANSACTION_EXECUTOR } from "./configs";
import { getWallet, logger } from "./utils";
import { LIQUIDITY_STATE_LAYOUT_V4, MARKET_STATE_LAYOUT_V3, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import { Bot } from "./automation/bot";
import { version } from './package.json';
import { getToken } from "./utils/token";
import { IBotConfig } from "./types/bot.types";
import { AccountLayout, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { MarketCache, PoolCache } from "./caches";
import { DefaultExecutor, JitoExecutor } from "./executor";
import { Listeners, OPEN_BOOK_SUBSCRIPTION_EVENT, POOL_SUBSCRIPTION_EVENT, WALLET_CHANGES_SUBSCRIPTION_EVENT } from "./listeners";

function printDetails(wallet: Keypair, quoteToken: Token, bot: Bot) {
  logger.info(`Bot Version: ${version} `);

  const botConfig = bot.config;

  logger.info('------- CONFIGURATION START -------');
  logger.info(`Wallet: ${wallet.publicKey.toString()}`);

  logger.info('- General Bot -');

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
  logger.info(`Pre load existing markets: ${PRE_LOAD_EXISTING_MARKETS}`);
  logger.info(`Cache new markets: ${CACHE_NEW_MARKETS}`);
  logger.info(`Log level: ${LOG_LEVEL}`);

  logger.info('- Buy -');
  logger.info(`Buy amount: ${botConfig.quoteAmount.toFixed()} ${botConfig.quoteToken.name}`);
  logger.info(`Auto buy delay: ${botConfig.autoBuyDelay} ms`);
  logger.info(`Max buy retries: ${botConfig.maxBuyRetries}`);
  logger.info(`Buy amount (${quoteToken.symbol}): ${botConfig.quoteAmount.toFixed()}`);
  logger.info(`Buy slippage: ${botConfig.buySlippage}%`);

  logger.info('- Sell -');
  logger.info(`Auto sell: ${AUTO_SELL}`);
  logger.info(`Auto sell delay: ${botConfig.autoSellDelay} ms`);
  logger.info(`Max sell retries: ${botConfig.maxSellRetries}`);
  logger.info(`Sell slippage: ${botConfig.sellSlippage}%`);
  logger.info(`Price check interval: ${botConfig.priceCheckInterval} ms`);
  logger.info(`Price check duration: ${botConfig.priceCheckDuration} ms`);
  logger.info(`Take profit: ${botConfig.takeProfit}%`);
  logger.info(`Stop loss: ${botConfig.stopLoss}%`);

  logger.info('- Filters -');
  logger.info(`Check renounced: ${CHECK_IF_MINT_IS_RENOUNCED}`);
  logger.info(`Check freezable: ${CHECK_IF_FREEZABLE}`);
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
};

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: COMMITMENT_LEVEL,
});

const runListener = async () => {
  logger.level = LOG_LEVEL;
  logger.info('Starting bot ....');

  const marketCache = new MarketCache(connection);
  const poolCache = new PoolCache();
  let txExecutor;

  if (TRANSACTION_EXECUTOR === 'jito') {
    txExecutor = new JitoExecutor(connection, CUSTOM_FEE);
  } else {
    txExecutor = new DefaultExecutor(connection)
  }

  const bot = new Bot(connection, marketCache, poolCache, txExecutor, botConfig);

  const isValid = await bot.validate();

  if (!isValid) {
    logger.info('Bot is exiting...');
    process.exit(1);
  }

  if (PRE_LOAD_EXISTING_MARKETS) {
    await marketCache.init({ quoteToken });
  }

  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  const listeners = new Listeners(connection);

  await listeners.start({
    walletPublicKey: wallet.publicKey,
    quoteToken,
    autoSell: AUTO_SELL,
    cacheNewMarkets: CACHE_NEW_MARKETS
  });

  listeners.on(OPEN_BOOK_SUBSCRIPTION_EVENT, (updatedAccountInfo: KeyedAccountInfo) => {
    const marketState = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);

    const marketId = updatedAccountInfo.accountId.toString();
    marketCache.save(marketId, marketState);
  });

  // const testFilters = new PoolFilters(connection, {
  //   quoteToken: quoteToken,
  //   minPoolSize: botConfig.minPoolSize,
  //   maxPoolSize: botConfig.maxPoolSize
  // });

  listeners.on(POOL_SUBSCRIPTION_EVENT, async (updatedAccountInfo: KeyedAccountInfo) => {
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
    const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
    const exists = await poolCache.get(poolState.baseMint.toBase58());


    if (!exists && poolOpenTime > runTimestamp) {
      poolCache.save(updatedAccountInfo.accountId.toString(), poolState);
      await bot.buy(updatedAccountInfo.accountId, poolState);

      // const shouldBuy = await testFilters.execute(poolState);
      // if (shouldBuy) {
      //   logger.info({ mint: poolState.baseMint.toBase58() }, 'matched pool');
      // }
    }
  });

  listeners.on(WALLET_CHANGES_SUBSCRIPTION_EVENT, async (updatedAccountInfo: KeyedAccountInfo) => {
    const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo.data);

    if (accountData.mint.equals(quoteToken.mint)) {
      return;
    }

    await bot.sell(updatedAccountInfo.accountId, accountData);
  });

  printDetails(wallet, quoteToken, bot);
}

runListener();