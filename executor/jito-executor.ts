import { BlockhashWithExpiryBlockHeight, Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { isProduction, logger } from "../utils";
import { IConfirmResponse, IExecutor } from "../types/executor.types";
import { Currency, CurrencyAmount } from "@raydium-io/raydium-sdk-v2";
import { encode } from "bs58";
import axios, { AxiosError } from "axios";
import { JITO_TIP_ACCOUNTS_DEVNET, JITO_TIP_ACCOUNTS_MAINNET } from "../configs";

export class JitoExecutor implements IExecutor {
  private _tipAccounts = isProduction() ? JITO_TIP_ACCOUNTS_MAINNET : JITO_TIP_ACCOUNTS_DEVNET;
  private _jitoFeeWallet: PublicKey;

  constructor(
    private readonly connection: Connection,
    private readonly jitoFee: string
  ) {
    this._jitoFeeWallet = this._getRandomValidatorKey();
  }

  private _getRandomValidatorKey(): PublicKey {
    const tipAccount = this._tipAccounts[this._tipAccounts.length * Math.random() | 0];

    return new PublicKey(tipAccount);
  }

  public async execAndConfirm(tx: VersionedTransaction, lastestBlockHash: BlockhashWithExpiryBlockHeight, payer: Keypair): Promise<IConfirmResponse> {
    logger.info('>> Starting Jito execution...');
    // update wallet key at each execution
    this._jitoFeeWallet = this._getRandomValidatorKey();

    logger.info('>> selected jito fee wallet: ', this._jitoFeeWallet.toBase58());

    try {
      const fee = new CurrencyAmount(Currency.SOL, this.jitoFee, false).raw.toNumber();
      logger.trace(`Calculated fee: ${fee} lamports`);

      //https://solana.com/docs/advanced/versions
      const jitoTipTxFeeMessage = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: lastestBlockHash.blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: this._jitoFeeWallet,
            lamports: fee
          })
        ]
      });

      const jitoFeeTx = new VersionedTransaction(jitoTipTxFeeMessage.compileToV0Message());
      jitoFeeTx.sign([payer]);


      // serialize transactions
      const serializedJitoFeeTx = encode(jitoFeeTx.serialize());
      const serializedTransaction = encode(tx.serialize());
      const serializedTransactions = [serializedJitoFeeTx, serializedTransaction];

      // https://jito-labs.gitbook.io/mev/searcher-resources/json-rpc-api-reference/url
      const endpoints = [
        'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
        'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
        'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
        'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
        'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
      ];

      /**
       * jsonrpc: string - set to "2.0"
          id: number - a unique client-generated identifying integer
          method: string - a string containing the method to be invoked
          params: array - a JSON array of ordered parameter values
       */
      const requests = endpoints.map((url) => axios.post(url, {
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [serializedTransactions]
      }));

      logger.trace('>Sending transactions to endpoints...');
      const responses = await Promise.all(requests.map(p => p.catch((e) => e)));

      const successfulResponses = responses.filter((r) => !(r instanceof Error));

      if (successfulResponses.length > 0) {
        logger.trace('>At least one successful response');
        logger.info('> confirming jito transaction...');

        const jitoTxSignature = encode(jitoFeeTx.signatures[0]);

        return await this._confirm(jitoTxSignature, lastestBlockHash);
      }

      logger.info('No successful responses received for jito')

      return { confirmed: false };
    } catch (error) {
      if (error instanceof AxiosError) {
        logger.trace({ error: error.response?.data }, 'Failed to execute jito transaction');
      }

      logger.error('Error during transaction execution', error);
      return { confirmed: false };
    }
  }

  private async _confirm(signature: string, lastestBlockHash: BlockhashWithExpiryBlockHeight): Promise<IConfirmResponse> {
    const confirmation = await this.connection.confirmTransaction({
      signature,
      lastValidBlockHeight: lastestBlockHash.lastValidBlockHeight,
      blockhash: lastestBlockHash.blockhash
    }, this.connection.commitment);

    return {
      signature,
      confirmed: !confirmation.value.err,
    }
  }
}