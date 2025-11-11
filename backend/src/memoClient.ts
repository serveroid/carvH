import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { AppConfig } from "./config";
import { logger } from "./logger";
import { ChainStatus } from "./types";

const parseSecretKey = (secret: string): Uint8Array => {
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as number[];
    return Uint8Array.from(parsed);
  }
  return bs58.decode(trimmed);
};

export type MemoResult =
  | {
      status: "submitted";
      signature: string;
      explorerUrl: string;
      memoVerified: boolean;
    }
  | {
      status: "skipped";
      message: string;
    }
  | {
      status: "failed";
      message: string;
    };

export class MemoClient {
  private connection?: Connection;
  private signer?: Keypair;
  private explorerBaseUrl: string;
  private rpcEndpoint?: string;

  constructor(config: AppConfig) {
    this.explorerBaseUrl = config.explorerBaseUrl;
    if (!config.isOnChainEnabled || !config.rpcEndpoint || !config.serverSecretKey) {
      logger.warn("On-chain memo disabled: RPC endpoint or secret key missing");
      return;
    }

    this.connection = new Connection(config.rpcEndpoint, "confirmed");
    this.rpcEndpoint = config.rpcEndpoint;
    try {
      this.signer = Keypair.fromSecretKey(parseSecretKey(config.serverSecretKey));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      logger.error({ err: message }, "Failed to parse server secret key");
    }
  }

  async ensureBalance(minLamports = 5000): Promise<boolean> {
    if (!this.connection || !this.signer) {
      return false;
    }
    try {
      const balance = await this.connection.getBalance(this.signer.publicKey);
      if (balance < minLamports) {
        logger.warn({ balance }, "Server wallet balance too low for memo submission");
        return false;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      logger.error({ err: message }, "Failed to fetch wallet balance");
      return false;
    }
  }

  async submitMemo(text: string): Promise<MemoResult> {
    if (!this.connection || !this.signer) {
      return {
        status: "skipped",
        message: "On-chain submission disabled. Provide RPC_ENDPOINT and SERVER_SECRET_KEY."
      };
    }

    const hasBalance = await this.ensureBalance();
    if (!hasBalance) {
      return {
        status: "failed",
        message: "Balance check failed. Fund the server wallet or verify the RPC endpoint."
      };
    }

    const memoInstruction = new TransactionInstruction({
      keys: [
        {
          pubkey: this.signer.publicKey,
          isSigner: true,
          isWritable: false
        }
      ],
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      data: Buffer.from(text, "utf8")
    });

    const transaction = new Transaction().add(memoInstruction);
    transaction.feePayer = this.signer.publicKey;

    try {
      const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.signer], {
        commitment: "confirmed"
      });
      const explorerUrl = `${this.explorerBaseUrl}${signature}`;
      const memoVerified = await this.verifyMemoSignature(signature, text);
      logger.info({ signature, memo: text, memoVerified }, "Memo submitted on-chain");
      return {
        status: "submitted",
        signature,
        explorerUrl,
        memoVerified
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      logger.error({ err: message }, "Failed to submit memo transaction");
      return {
        status: "failed",
        message
      };
    }
  }

  private async verifyMemoSignature(signature: string, expectedMemo: string): Promise<boolean> {
    if (!this.connection) {
      return false;
    }

    try {
      const parsed = await this.connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });

      const instructions = parsed?.transaction.message.instructions ?? [];
      return instructions.some((instruction) => {
        if ("parsed" in instruction && instruction.program === "spl-memo") {
          const memo = (instruction.parsed as { type?: string; info?: { memo?: string } })?.info?.memo;
          return memo === expectedMemo;
        }
        return false;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ err: message, signature }, "Failed to verify memo contents");
      return false;
    }
  }

  async getStatus(): Promise<ChainStatus> {
    if (!this.connection || !this.signer || !this.rpcEndpoint) {
      return {
        enabled: false as const,
        message: "On-chain submission disabled. Provide RPC_ENDPOINT and SERVER_SECRET_KEY."
      };
    }

    try {
      const [balance, blockhash] = await Promise.all([
        this.connection.getBalance(this.signer.publicKey),
        this.connection.getLatestBlockhash()
      ]);

      return {
        enabled: true as const,
        rpcEndpoint: this.rpcEndpoint,
        wallet: this.signer.publicKey.toBase58(),
        balanceLamports: balance,
        balanceSol: balance / LAMPORTS_PER_SOL,
        latestBlockhash: blockhash.blockhash,
        explorerBaseUrl: this.explorerBaseUrl
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: message }, "Failed to retrieve chain status");
      return {
        enabled: false as const,
        message
      };
    }
  }

  getOnChainContext():
    | {
        connection: Connection;
        signer: Keypair;
        explorerBaseUrl: string;
      }
    | undefined {
    if (!this.connection || !this.signer) {
      return undefined;
    }
    return {
      connection: this.connection,
      signer: this.signer,
      explorerBaseUrl: this.explorerBaseUrl
    };
  }
}
