"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewardService = exports.formatDisplayAmount = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const logger_1 = require("./logger");
const formatDisplayAmount = (amount, decimals) => {
    if (decimals === 0) {
        return amount.toString();
    }
    const base = BigInt(10) ** BigInt(decimals);
    const whole = amount / base;
    const fraction = amount % base;
    const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
    return fractionStr.length > 0 ? `${whole.toString()}.${fractionStr}` : whole.toString();
};
exports.formatDisplayAmount = formatDisplayAmount;
class RewardService {
    constructor(config, memoClient) {
        this.config = config;
        this.memoClient = memoClient;
        this.enabled = config.isRewardEnabled;
        this.decimals = config.rewardTokenDecimals;
        this.tokensPerScore = config.rewardTokensPerScore;
        this.minScore = config.rewardMinScore;
        this.mint = config.rewardTokenMint ? new web3_js_1.PublicKey(config.rewardTokenMint) : undefined;
    }
    async distributeReward(input) {
        if (!this.enabled || !this.mint) {
            return {
                status: "skipped",
                amountRaw: "0",
                amountDisplay: "0",
                reason: "Rewards are disabled on the server.",
                mint: this.config.rewardTokenMint ?? "unknown"
            };
        }
        if (input.score < this.minScore) {
            return {
                status: "skipped",
                amountRaw: "0",
                amountDisplay: "0",
                reason: `Score ${input.score} is below the reward threshold. Minimum: ${this.minScore}.`,
                mint: this.mint.toBase58()
            };
        }
        const context = this.memoClient.getOnChainContext();
        if (!context) {
            return {
                status: "skipped",
                amountRaw: "0",
                amountDisplay: "0",
                reason: "On-chain context is unavailable. Check the RPC endpoint and server key.",
                mint: this.mint.toBase58()
            };
        }
        const baseUnitsPerScore = BigInt(Math.round(this.tokensPerScore * Math.pow(10, this.decimals)));
        const amountRaw = baseUnitsPerScore * BigInt(Math.round(input.score));
        if (amountRaw <= 0) {
            return {
                status: "skipped",
                amountRaw: "0",
                amountDisplay: "0",
                reason: "Reward amount is zero. Check the configuration.",
                mint: this.mint.toBase58()
            };
        }
        const amountDisplay = (0, exports.formatDisplayAmount)(amountRaw, this.decimals);
        const userPublicKey = new web3_js_1.PublicKey(input.wallet);
        const serverPublicKey = context.signer.publicKey;
        const userAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.mint, userPublicKey);
        const serverAta = await (0, spl_token_1.getAssociatedTokenAddress)(this.mint, serverPublicKey);
        const transaction = new web3_js_1.Transaction();
        const connection = context.connection;
        const [userAtaInfo, serverAtaInfo] = await Promise.all([
            connection.getAccountInfo(userAta),
            connection.getAccountInfo(serverAta)
        ]);
        if (!serverAtaInfo) {
            return {
                status: "failed",
                amountRaw: amountRaw.toString(),
                amountDisplay,
                reason: "The server wallet does not have an ATA for the reward token. Create it beforehand.",
                mint: this.mint.toBase58()
            };
        }
        if (!userAtaInfo) {
            transaction.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(serverPublicKey, userAta, userPublicKey, this.mint));
        }
        transaction.add((0, spl_token_1.createTransferCheckedInstruction)(serverAta, this.mint, userAta, serverPublicKey, Number(amountRaw), this.decimals, [], spl_token_1.TOKEN_PROGRAM_ID));
        try {
            const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [context.signer], {
                commitment: "confirmed"
            });
            const explorerUrl = `${context.explorerBaseUrl}${signature}`;
            logger_1.logger.info({ wallet: input.wallet, signature, amountRaw: amountRaw.toString() }, "Reward minted");
            return {
                status: "minted",
                amountRaw: amountRaw.toString(),
                amountDisplay,
                signature,
                explorerUrl,
                mint: this.mint.toBase58()
            };
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            logger_1.logger.error({ wallet: input.wallet, err: reason }, "Failed to mint reward");
            return {
                status: "failed",
                amountRaw: amountRaw.toString(),
                amountDisplay,
                reason,
                mint: this.mint.toBase58()
            };
        }
    }
    async getServerBalance() {
        if (!this.enabled || !this.mint) {
            return undefined;
        }
        const context = this.memoClient.getOnChainContext();
        if (!context) {
            return undefined;
        }
        try {
            const ata = await (0, spl_token_1.getAssociatedTokenAddress)(this.mint, context.signer.publicKey);
            const balance = await context.connection.getTokenAccountBalance(ata);
            const raw = BigInt(balance.value.amount);
            return {
                mint: this.mint.toBase58(),
                amountRaw: raw.toString(),
                amountDisplay: balance.value.uiAmountString ?? (0, exports.formatDisplayAmount)(raw, this.decimals)
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn({ err: message }, "Failed to read reward balance");
            return undefined;
        }
    }
}
exports.RewardService = RewardService;
//# sourceMappingURL=rewardService.js.map