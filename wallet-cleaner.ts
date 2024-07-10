import { Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createCloseAccountInstruction } from "@solana/spl-token";
import { logger } from "./utils";

export class WalletCleaner {
  private garbages: string[] = [];
  private maxSize: number = 5;
  private locking: boolean = false;

  public constructor(private readonly connection: Connection, private readonly wallet: Keypair) { }

  public add(baseMint: string) {
    if (!~this.garbages.indexOf(baseMint)) {
      this.garbages.push(baseMint);
    }

    if (!this.locking && this.garbages.length >= this.maxSize) {
      const garbages = this.garbages.slice(0, this.maxSize);
      
      this.clean(garbages);
    }
  }

  public async clean(bunch: string[]) {
    logger.info('start cleaning')
    this.locking = true;

    const instructions: TransactionInstruction[] = [];

    bunch.forEach((mint) => {
      instructions.push(createCloseAccountInstruction(new PublicKey(mint), this.wallet.publicKey, this.wallet.publicKey))
    });

    const lastestBlockHash = await this.connection.getLatestBlockhash({ commitment: this.connection.commitment });

    const messageV0 = new TransactionMessage({
      payerKey: this.wallet.publicKey,
      recentBlockhash: lastestBlockHash.blockhash,
      instructions: instructions
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([this.wallet]);

    const txId = await this.connection.sendRawTransaction(transaction.serialize(), { preflightCommitment: this.connection.commitment });

    const confirmation = await this.connection.confirmTransaction({
      signature: txId,
      lastValidBlockHeight: lastestBlockHash.lastValidBlockHeight,
      blockhash: lastestBlockHash.blockhash
    }, this.connection.commitment);

    if(!confirmation.value.err) {
      logger.info('cleaning success');
      this.garbages = this.garbages.filter((mint) => !~bunch.indexOf(mint));
    }
    
    this.locking = false;
    logger.info('end cleaning')
  }
}