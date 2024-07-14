import { Connection, KeyedAccountInfo, Keypair } from "@solana/web3.js";
import { AUTO_BUY_DELAY, AUTO_SELL, AUTO_SELL_DELAY, BUY_SLIPPAGE, CHECK_IF_BURNED, CHECK_IF_FREEZABLE, CHECK_IF_MINT_IS_RENOUNCED, COMMITMENT_LEVEL, COMPUTE_UNIT_LIMIT, COMPUTE_UNIT_PRICE, CUSTOM_FEE, LOG_LEVEL, MAX_BUY_RETRIES, MAX_POOL_SIZE, MAX_SELL_RETRIES, MIN_LP_BURNED_PERCENT, MIN_POOL_SIZE, ONE_TOKEN_AT_A_TIME, PRICE_CHECK_DURATION, PRICE_CHECK_INTERVAL, PRIVATE_KEY, QUOTE_AMOUNT, QUOTE_MINT, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SELL_SLIPPAGE, STOP_LOSS, TAKE_PROFIT, TRANSACTION_EXECUTOR, CHECK_IF_MUTABLE, CHECK_IF_SOCIALS, CLUSTER } from "./configs";
import { getWallet, logger } from "./utils";
import { LIQUIDITY_VERSION_TO_STATE_LAYOUT, LiquidityStateV4, Raydium, Token, TokenAmount, parseBigNumberish } from "@raydium-io/raydium-sdk-v2";
import { Bot } from "./automation/bot";
import { version } from './package.json';
import { getToken } from "./utils/token";
import { IBotConfig } from "./types/bot.types";
import { AccountLayout, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PoolCache } from "./caches";
import { DefaultExecutor, JitoExecutor } from "./executor";
import { Listeners, POOL_SUBSCRIPTION_EVENT, PREPARE_FOR_SELLING_EVENT } from "./listeners";
import { DB } from "./db";
import { WalletCleaner } from "./wallet-cleaner";
import { BN } from "bn.js";

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
};

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: COMMITMENT_LEVEL,
});

const app = async (db: DB, raydium: Raydium) => {
  logger.level = LOG_LEVEL;
  logger.info('Starting bot ....');

  const poolCache = new PoolCache();
  const cleaner = new WalletCleaner(connection, wallet);

  let txExecutor;
  if (TRANSACTION_EXECUTOR === 'jito') {
    txExecutor = new JitoExecutor(connection, CUSTOM_FEE);
  } else {
    txExecutor = new DefaultExecutor(connection)
  }

  const bot = new Bot(connection, poolCache, raydium, txExecutor, botConfig, db);

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
    const poolId = updatedAccountInfo.accountId.toString();
    const poolState = LIQUIDITY_VERSION_TO_STATE_LAYOUT[4].decode(updatedAccountInfo.accountInfo.data) as LiquidityStateV4;

    const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
    const baseMint = poolState.baseMint.toBase58();
    const exists = poolCache.get(baseMint);
    if (!exists && poolOpenTime > runTimestamp) {
      poolCache.save(baseMint, {
        marketId: poolState.marketId.toBase58(),
        baseDecimal: poolState.baseDecimal.toNumber(),
        poolId,
        baseMint
      });

      await bot.buy(poolId, poolState);
    }
  });
  
  listeners.on(PREPARE_FOR_SELLING_EVENT, async (updatedAccountInfo: KeyedAccountInfo) => {
    const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo.data);
    const amountIn = parseBigNumberish(accountData.amount);

    if (accountData.mint.equals(quoteToken.mint)) {
      if(amountIn.lt(new BN(0.0001))) {
        logger.warn('EMPTY BALANCE!!!!!');
        await listeners.stop();
      }
      return;
    }

    if (amountIn.isZero()) { // sold
      cleaner.add(updatedAccountInfo.accountId.toBase58());
      return;
    }

    logger.info({ baseMint: accountData.mint.toBase58() }, "PREPARE_FOR_SELLING")

    // const ataIn = updatedAccountInfo.accountId;
    await bot.sell(accountData);
  });

  printDetails(wallet, quoteToken, bot);
}

// init db
const db = new DB('store/db.json');


async function initRaydiumSDK(params: { loadTokens: boolean }): Promise<Raydium> {
  console.log(`[Raydium] connect to rpc ${connection.rpcEndpoint} in ${CLUSTER}`);
  const raydium = await Raydium.load({
    owner: wallet,
    connection,
    cluster: CLUSTER,
    disableFeatureCheck: true,
    disableLoadToken: !params.loadTokens,
    blockhashCommitment: COMMITMENT_LEVEL
  });

  return raydium;
  /**
   * By default: sdk will automatically fetch token account data when need it or any sol balace changed.
   * if you want to handle token account by yourself, set token account data after init sdk
   * code below shows how to do it.
   * note: after call raydium.account.updateTokenAccount, raydium will not automatically fetch token account
   */

  /*  
  raydium.account.updateTokenAccount(await fetchTokenAccountData())
  connection.onAccountChange(owner.publicKey, async () => {
    raydium!.account.updateTokenAccount(await fetchTokenAccountData())
  })
  */
}

db.on('ready', async () => {
  const raydium = await initRaydiumSDK({ loadTokens: false });

  await app(db, raydium);
});