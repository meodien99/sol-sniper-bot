# Intro

This bot allows you to automate your crypto trading strategies on the Solana blockchain. The bot is currently written in JS and uses the Raydium V2 SDK to execute trades.
Basic logics here is listen new pool created in Raydium AMM and if that token matches the filter sets based on the predefined parameters, it executes strategies set by the user.
Simply the bot will periodity calculate the price and if it hits TP/SL or the `PRICE_CHECK_DURATION` timedout - bot will sell the token 
(Because there are many rugged pull here, it's better to sell tokens before the liquidity is too low, when the `amoutOut` is too small you can not sell that token anymore, or can't redeem the rental fee `0.002 SOL` by default);

## Disclaimer
> 🛑 This bot can lead to loss of your funds, use at your own risk. Start with small amounts and protect your keys.
- This Bot is provided as is, for learning purposes.
- This bot is provided without any warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.
- In no event shall the authors be liable for any claim, damages, or other liability.
- Trading cryptocurrencies and tokens involves risk, and past performance is not indicative of future results.
- The use of this bot is at your own risk, and we are not responsible for any losses incurred while using the bot.

## Setup

To run the script you need to:

- Create a new empty Solana wallet
- Transfer some SOL to it.
- Convert some SOL to WSOL (via Jupiter or Raydium).
- Install dependencies by typing: `npm install`
- Run the script by typing: `npm run start` in terminal
- Updating `.env`, Use contents template inside the `.env.example`. (Check [Configuration](#configuration) section bellow).

### Configuration

#### Wallet

- `PRIVATE_KEY` - Your wallet's private key.

#### Connection

- `RPC_ENDPOINT` - HTTPS RPC endpoint for interacting with the Solana network.
- `RPC_WEBSOCKET_ENDPOINT` - WebSocket RPC endpoint for real-time updates from the Solana network.
- `COMMITMENT_LEVEL`- The commitment level of transactions (e.g., "finalized" for the highest level of security).

#### Bot

- `LOG_LEVEL` - Set logging level, e.g., `info`, `debug`, `trace`, etc.
- `ONE_TOKEN_AT_A_TIME` - Set to `true` to process buying one token at a time.
- `COMPUTE_UNIT_LIMIT` - Compute limit used to calculate fees.
- `COMPUTE_UNIT_PRICE` - Compute price used to calculate fees.
- `TRANSACTION_EXECUTOR` -  default or jito
- `CUSTOM_FEE` - If using warp or jito executors this value will be used for transaction fees instead of `COMPUTE_UNIT_LIMIT` and `COMPUTE_UNIT_LIMIT`
  - Minimum value is 0.0001 SOL, but recommend using 0.006 SOL or above
  - On top of this fee, minimal solana network fee will be applied
- `WAIT_FOR_RETRY_MS=800` - Wait in ms for each retrying (buy/sell)

#### Buy

- `QUOTE_MINT` - Which pools to snipe, USDC or WSOL.
- `QUOTE_AMOUNT` - Amount used to buy each new token.
- `AUTO_BUY_DELAY` - Delay in milliseconds before buying a token.
- `MAX_BUY_RETRIES` - Maximum number of retries for buying a token.
- `BUY_SLIPPAGE` - Slippage %

#### Sell

- `AUTO_SELL` - Set to `true` to enable automatic selling of tokens.
  - If you want to manually sell bought tokens, disable this option.
- `MAX_SELL_RETRIES` - Maximum number of retries for selling a token.
- `AUTO_SELL_DELAY` - Delay in milliseconds before auto-selling a token.
- `PRICE_CHECK_INTERVAL` - Interval in milliseconds for checking the take profit and stop loss conditions.
  - Set to zero to disable take profit and stop loss.
- `PRICE_CHECK_DURATION` - Time in milliseconds to wait for stop loss/take profit conditions.
  - If you don't reach profit or loss bot will auto sell after this time.
  - Set to zero to disable take profit and stop loss.
- `TAKE_PROFIT` - Percentage profit at which to take profit.
  - Take profit is calculated based on quote mint.
- `STOP_LOSS` - Percentage loss at which to stop the loss.
  - Stop loss is calculated based on quote mint.
- `SELL_SLIPPAGE` - Slippage %.

#### Filters

- `CHECK_IF_MUTABLE` - Set to `true` to buy tokens only if their metadata are not mutable.
- `CHECK_IF_SOCIALS` - Set to `true` to buy tokens only if they have at least 1 social.
- `CHECK_IF_MINT_IS_RENOUNCED` - Set to `true` to buy tokens only if their mint is renounced.
- `CHECK_IF_FREEZABLE` - Set to `true` to buy tokens only if they are not freezable.
- `CHECK_IF_BURNED` - Set to `true` to buy tokens only if their liquidity pool is burned.
- `MIN_LP_BURNED_PERCENT` - Some tokens only send 1 token to burned, it's better to calculate burned percent.
- `MIN_POOL_SIZE` - Bot will buy only if the pool size is greater than or equal the specified amount.
  - Set `0` to disable.
- `MAX_POOL_SIZE` - Bot will buy only if the pool size is less than or equal the specified amount.
  - Set `0` to disable.

### Some tips 👀
- 🔨 The bot is a Tool, not a holy grail that will make you rich just by running it. If you don't know what you are doing, you WILL lose money.
- RPC / Network speed & good trading strategy is the key to success. You can speed up the bor but disabling AMMS not being used or too slow.
- Not everything is so obvious. eg. a larger trade size can lead to smaller profits than a lower trade size.
- If you frequently get 429 errors, try to reduce `PRICE_CHECK_INTERVAL` or `FILTER_CHECK_INTERVAL`.
- If you can't run the bot, it's likely something wrong with the network, RPC, or config file

### Common issues

If you have an error which is not listed here, please create a new issue in this repository.
To collect more information on an issue, please change `LOG_LEVEL` to `debug`.

- If you see following error in your log file:  
  `Error: 410 Gone:  {"jsonrpc":"2.0","error":{"code": 410, "message":"The RPC call or parameters have been disabled."}, "id": "986f3599-b2b7-47c4-b951-074c19842bad" }`  
  it means your RPC node doesn't support methods needed to execute script.
  - FIX: Change to use RPC node from some provider such as Helius or QuickNode...
- If you see following error in your log file:  
  `Error: No SOL token account found in wallet: `  
  it means that wallet you provided doesn't have USDC/WSOL token account.
  - To fix it: Go to dex (JUP for example) and swap some SOL to USDC/WSOL ([tutorial](https://station.jup.ag/guides/general/wrapped-sol))