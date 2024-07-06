import { Token } from "@raydium-io/raydium-sdk";

export const getToken = (token: string): Token => {
  switch (token) {
    case 'WSOL': {
      return Token.WSOL;
    }
    default: {
      throw new Error(`Unsupported quote mint "${token}". Supported values are USDC and WSOL`);
    }
  }
}