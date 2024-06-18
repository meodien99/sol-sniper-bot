import { BlockhashWithExpiryBlockHeight, Keypair, VersionedTransaction } from "@solana/web3.js";

export interface IConfirmResponse {
  confirmed: boolean;
  signature?: string;
  error?: string;
}

export interface IExecutor {
  execAndConfirm(
    tx: VersionedTransaction,
    payer: Keypair,
    lastestBlockHash: BlockhashWithExpiryBlockHeight
  ): Promise<IConfirmResponse>
};