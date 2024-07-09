import { BlockhashWithExpiryBlockHeight, Connection, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { IConfirmResponse, IExecutor } from "../types/executor.types";
import { logger } from "../utils";

export class DefaultExecutor implements IExecutor {
  constructor(private readonly connection: Connection) {}

  public async execAndConfirm(
    tx: VersionedTransaction, 
    _: Keypair, 
    lastestBlockHash: BlockhashWithExpiryBlockHeight
  ): Promise<IConfirmResponse> {
    logger.info('Executing Transaction ...');

    const signature = await this._execute(tx);

    logger.info('Confirming Transaction ... sign:', signature);
    return this._confirm(signature, lastestBlockHash);
  }

  private async _execute(tx: Transaction | VersionedTransaction): Promise<string> {
    return this.connection.sendRawTransaction(tx.serialize(), {
      preflightCommitment: this.connection.commitment
      // preflightCommitment: "processed",
      // skipPreflight: true
    });
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