"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoClient = void 0;
const bs58_1 = __importDefault(require("bs58"));
const web3_js_1 = require("@solana/web3.js");
const logger_1 = require("./logger");
const parseSecretKey = (secret) => {
    const trimmed = secret.trim();
    if (trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        return Uint8Array.from(parsed);
    }
    return bs58_1.default.decode(trimmed);
};
class MemoClient {
    constructor(config) {
        this.explorerBaseUrl = config.explorerBaseUrl;
        if (!config.isOnChainEnabled || !config.rpcEndpoint || !config.serverSecretKey) {
            logger_1.logger.warn("On-chain memo disabled: RPC endpoint or secret key missing");
            return;
        }
        this.connection = new web3_js_1.Connection(config.rpcEndpoint, "confirmed");
        this.rpcEndpoint = config.rpcEndpoint;
        try {
            this.signer = web3_js_1.Keypair.fromSecretKey(parseSecretKey(config.serverSecretKey));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "unknown error";
            logger_1.logger.error({ err: message }, "Failed to parse server secret key");
        }
    }
    async ensureBalance(minLamports = 5000) {
        if (!this.connection || !this.signer) {
            return false;
        }
        try {
            const balance = await this.connection.getBalance(this.signer.publicKey);
            if (balance < minLamports) {
                logger_1.logger.warn({ balance }, "Server wallet balance too low for memo submission");
                return false;
            }
            return true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "unknown";
            logger_1.logger.error({ err: message }, "Failed to fetch wallet balance");
            return false;
        }
    }
    async submitMemo(text) {
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
        const memoInstruction = new web3_js_1.TransactionInstruction({
            keys: [
                {
                    pubkey: this.signer.publicKey,
                    isSigner: true,
                    isWritable: false
                }
            ],
            programId: new web3_js_1.PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
            data: Buffer.from(text, "utf8")
        });
        const transaction = new web3_js_1.Transaction().add(memoInstruction);
        transaction.feePayer = this.signer.publicKey;
        try {
            const signature = await (0, web3_js_1.sendAndConfirmTransaction)(this.connection, transaction, [this.signer], {
                commitment: "confirmed"
            });
            const explorerUrl = `${this.explorerBaseUrl}${signature}`;
            const memoVerified = await this.verifyMemoSignature(signature, text);
            logger_1.logger.info({ signature, memo: text, memoVerified }, "Memo submitted on-chain");
            return {
                status: "submitted",
                signature,
                explorerUrl,
                memoVerified
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "unknown";
            logger_1.logger.error({ err: message }, "Failed to submit memo transaction");
            return {
                status: "failed",
                message
            };
        }
    }
    async verifyMemoSignature(signature, expectedMemo) {
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
                    const memo = instruction.parsed?.info?.memo;
                    return memo === expectedMemo;
                }
                return false;
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn({ err: message, signature }, "Failed to verify memo contents");
            return false;
        }
    }
    async getStatus() {
        if (!this.connection || !this.signer || !this.rpcEndpoint) {
            return {
                enabled: false,
                message: "On-chain submission disabled. Provide RPC_ENDPOINT and SERVER_SECRET_KEY."
            };
        }
        try {
            const [balance, blockhash] = await Promise.all([
                this.connection.getBalance(this.signer.publicKey),
                this.connection.getLatestBlockhash()
            ]);
            return {
                enabled: true,
                rpcEndpoint: this.rpcEndpoint,
                wallet: this.signer.publicKey.toBase58(),
                balanceLamports: balance,
                balanceSol: balance / web3_js_1.LAMPORTS_PER_SOL,
                latestBlockhash: blockhash.blockhash,
                explorerBaseUrl: this.explorerBaseUrl
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error({ err: message }, "Failed to retrieve chain status");
            return {
                enabled: false,
                message
            };
        }
    }
    getOnChainContext() {
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
exports.MemoClient = MemoClient;
//# sourceMappingURL=memoClient.js.map