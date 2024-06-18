import { Token } from "@raydium-io/raydium-sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { USDC_ADDRESS } from "../configs";

export const getToken = (token: string): Token => {
  switch (token) {
    case 'WSOL': {
      return Token.WSOL;
    }
    case 'USDC': {
      return new Token(
        TOKEN_PROGRAM_ID,
        new PublicKey(USDC_ADDRESS),
        6,
        'USDC',
        'USDC',
      );
    }
    default: {
      throw new Error(`Unsupported quote mint "${token}". Supported values are USDC and WSOL`);
    }
  }
}