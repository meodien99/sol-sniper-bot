import { AccountLayout, NATIVE_MINT, TOKEN_PROGRAM_ID, closeAccount, createAssociatedTokenAccountInstruction, createMint, createSyncNativeInstruction, getAccount, getAssociatedTokenAddress, getMint, getOrCreateAssociatedTokenAccount, mintTo, transfer } from '@solana/spl-token';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, clusterApiUrl, sendAndConfirmTransaction } from '@solana/web3.js';
import { decode } from 'bs58';

const secretKey = new Uint8Array([
  211,  15, 207, 174, 238,  94, 173,  64,  64, 202, 200,
  213, 157,  72,  60, 219, 103, 216,  52, 214, 230,   1,
   58, 212, 249, 193, 174,   2, 133,  86, 182, 198, 247,
  177,  54,  22, 172, 106,   1, 195, 220,  46, 146,   3,
   16, 122,  76,  47, 183, 122,  21,   3, 210, 219, 211,
  233, 239, 213, 122, 205,  90, 110, 155, 173
]);

const payer = Keypair.fromSecretKey(secretKey);

const mint = new PublicKey("8qZFhPWdpB5FTTNT3QSRzufJGMYcNsz9UoiEq1Gavsfw");
const tokenAccount = new PublicKey("ELVdwdbvfUDjGU3Ak4paTzw4H3WYmWnyrWiPQxCjLjJ9");
const mintAuthority = new PublicKey("CUogY8wRBsdfqMzKZYZ1nvjpbZuUTK5odPCEqE3GwEsS");

async function init() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  // const mintAuthority = Keypair.generate();
  // console.log('>mintAuthority', payer);
  // const freezeAuthority = Keypair.generate();

  // const airdropSignature = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
  
  // await connection.confirmTransaction(airdropSignature);

  // const mint = await createMint(
  //   connection,
  //   payer,
  //   mintAuthority.publicKey,
  //   freezeAuthority.publicKey,
  //   9
  // )

  // console.log('mint base58', mint.toBase58());

  const mintInfo = await getMint(connection, mint);

  console.log('>info', mintInfo.mintAuthority);

  // const tokenAccount = await getOrCreateAssociatedTokenAccount(
  //   connection,
  //   payer,
  //   mint,
  //   payer.publicKey
  // );

  console.log('>tokenAccount Address,', tokenAccount.toBase58());

  const tokenAccountInfo = await getAccount(connection, tokenAccount);
  console.log('>tokenAccount Amount,', tokenAccountInfo.amount);

  await mintTo(connection, payer, mint, tokenAccount, mintAuthority, Math.pow(10, 9) * 100)
}

async function getAccountInfo() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const tokenAccounts = await connection.getTokenAccountsByOwner(payer.publicKey, {
    programId: TOKEN_PROGRAM_ID
  });

  console.log("Token                                         Balance");
  console.log("------------------------------------------------------------");
  tokenAccounts.value.forEach((tokenAccount) => {
    const accountData = AccountLayout.decode(tokenAccount.account.data);

    console.log(`${new PublicKey(accountData.mint)}     ${accountData.amount}`)
  });
}

// wrap sol in token
async function wrapSOLToToken() {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const wallet = Keypair.generate();
  console.log('>wallet', wallet.secretKey);

  const airdropSignature = await connection.requestAirdrop(
    wallet.publicKey,
    2 * LAMPORTS_PER_SOL
  );

  await connection.confirmTransaction(airdropSignature);

  const associatedTokenAccount = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);

  // create Token Account that hold WSol
  const ataTransaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      associatedTokenAccount,
      wallet.publicKey,
      NATIVE_MINT
    )
  );

  await sendAndConfirmTransaction(connection, ataTransaction, [wallet]);

  // Transfer SOL to associated token account and use nativeSync to update WSol balance
  const solTransferTransaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: associatedTokenAccount,
      lamports: LAMPORTS_PER_SOL
    }),
    createSyncNativeInstruction(
      associatedTokenAccount
    )
  );

  await sendAndConfirmTransaction(connection, solTransferTransaction, [wallet]);

  const accountInfo = await getAccount(connection, associatedTokenAccount);

  console.log(`Native: ${accountInfo.isNative}, Lamports: ${accountInfo.amount}`);

  //unwrap token back to SOL

  const walletBalance = await connection.getBalance(wallet.publicKey);

  console.log('balance before unwrap sol', walletBalance)
  
  await closeAccount(connection, wallet, associatedTokenAccount, wallet.publicKey, wallet);

  const walletBalancePostClose = await connection.getBalance(wallet.publicKey);
  console.log(`Balance after unwrapping 1 WSOL: ${walletBalancePostClose}`)
}

// transfering token to another
async function transferTokenToAnother() {
  // connection to cluster
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const fromWallet = Keypair.generate();
  const fromAirdropSign = await connection.requestAirdrop(fromWallet.publicKey, LAMPORTS_PER_SOL);

  // wait for airdrop confirmation
  await connection.confirmTransaction(fromAirdropSign);

  // Generate a new wallet to receive newly minted token
  const toWallet = Keypair.generate();

  // create new token mint
  const mint = await createMint(connection, fromWallet, fromWallet.publicKey, null, 9);

  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(connection, fromWallet, mint, fromWallet.publicKey);
  // get the token account of the fromWallet address, and if it does not exist, create it
  const toTokenAccount = await getOrCreateAssociatedTokenAccount(connection, fromWallet, mint, toWallet.publicKey);

  // mint 1 new token to the 'fromTokenAccount' account we just created.
  let sign = await mintTo(connection, fromWallet, mint, fromTokenAccount.address, fromWallet.publicKey, 1000000000);

  // transfer new token to 'toTokenAccount'
  await transfer(
    connection,
    fromWallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    fromWallet.publicKey,
    50,
    [fromWallet, toWallet] // let payer pays fee
  )
}