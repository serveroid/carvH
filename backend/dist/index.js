"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const config_1 = require("./config");
const memoClient_1 = require("./memoClient");
const quests_1 = require("./quests");
const submissionService_1 = require("./submissionService");
const rateLimiter_1 = require("./rateLimiter");
const logger_1 = require("./logger");
const submissionHistory_1 = require("./submissionHistory");
const identityRegistry_1 = require("./identityRegistry");
const authService_1 = require("./authService");
const rewardService_1 = require("./rewardService");
const leaderboardService_1 = require("./leaderboardService");
const carvOAuthService_1 = require("./carvOAuthService");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "16kb" }));
app.use((0, morgan_1.default)("tiny", {
    stream: {
        write: (message) => logger_1.logger.info({ msg: message.trim() })
    }
}));
const memoClient = new memoClient_1.MemoClient(config_1.AppConfig);
const submissionHistory = new submissionHistory_1.SubmissionHistory(20, config_1.AppConfig.historyStoragePath);
const identityRegistry = new identityRegistry_1.IdentityRegistry(config_1.AppConfig.identityStoragePath);
const authService = new authService_1.AuthService(identityRegistry, config_1.AppConfig.sessionTtlMinutes, config_1.AppConfig.challengeTtlMinutes);
const rewardService = new rewardService_1.RewardService(config_1.AppConfig, memoClient);
const leaderboardService = new leaderboardService_1.LeaderboardService(submissionHistory, config_1.AppConfig.rewardTokenDecimals);
const submissionService = new submissionService_1.SubmissionService(memoClient, authService, rewardService, submissionHistory);
const carvOAuthService = new carvOAuthService_1.CarvOAuthService(config_1.AppConfig);
setInterval(() => (0, rateLimiter_1.clearExpiredSubmissions)(), 60000).unref();
app.get("/health", (_, res) => {
    res.json({ status: "ok", onChain: config_1.AppConfig.isOnChainEnabled });
});
app.get("/api/quests", (_, res) => {
    res.json(quests_1.quests);
});
app.post("/api/auth/challenge", (req, res) => {
    try {
        const payload = authService.requestChallenge({
            wallet: req.body?.walletAddress ?? req.body?.wallet,
            carvId: req.body?.carvId,
            agentId: req.body?.agentId,
            alias: req.body?.alias
        });
        res.json(payload);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to issue challenge.";
        res.status(400).json({ message });
    }
});
app.post("/api/auth/verify", (req, res) => {
    try {
        const session = authService.verifyChallenge({
            wallet: req.body?.walletAddress ?? req.body?.wallet,
            carvId: req.body?.carvId,
            agentId: req.body?.agentId,
            signature: req.body?.signature,
            nonce: req.body?.nonce
        });
        res.json({
            token: session.token,
            wallet: session.wallet,
            carvId: session.carvId,
            agentId: session.agentId,
            alias: session.alias,
            expiresAt: session.expiresAt
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to verify signature.";
        res.status(400).json({ message });
    }
});
app.post("/api/auth/logout", (req, res) => {
    const token = req.body?.token;
    if (typeof token === "string") {
        authService.invalidateSession(token);
    }
    res.json({ status: "ok" });
});
app.get("/api/auth/carv/status", (_req, res) => {
    res.json({ enabled: carvOAuthService.isEnabled() });
});
app.get("/api/auth/carv/url", (_req, res) => {
    try {
        if (!carvOAuthService.isEnabled()) {
            res.status(400).json({ message: "CARV OAuth is disabled on the server" });
            return;
        }
        const payload = carvOAuthService.createAuthorizationUrl();
        res.json({ url: payload.url, state: payload.state });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to prepare CARV OAuth link";
        res.status(400).json({ message });
    }
});
app.post("/api/auth/carv/callback", async (req, res) => {
    try {
        if (!carvOAuthService.isEnabled()) {
            res.status(400).json({ message: "CARV OAuth is disabled on the server" });
            return;
        }
        const code = typeof req.body?.code === "string" ? req.body.code : "";
        const state = typeof req.body?.state === "string" ? req.body.state : "";
        if (!code || !state) {
            res.status(400).json({ message: "Missing code/state parameters for CARV OAuth" });
            return;
        }
        const profile = await carvOAuthService.exchangeCode({ code, state });
        res.json(profile);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to process CARV OAuth response";
        res.status(400).json({ message });
    }
});
app.get("/api/chain/status", async (_req, res) => {
    try {
        const status = await memoClient.getStatus();
        if (status.enabled) {
            const rewardBalance = await rewardService.getServerBalance();
            if (rewardBalance) {
                status.rewardMint = rewardBalance.mint;
                status.rewardBalanceRaw = rewardBalance.amountRaw;
                status.rewardBalanceDisplay = rewardBalance.amountDisplay;
            }
            else if (config_1.AppConfig.rewardTokenMint) {
                status.rewardMint = config_1.AppConfig.rewardTokenMint;
            }
        }
        res.json(status);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch status";
        logger_1.logger.error({ err: message }, "Chain status endpoint failed");
        res.status(500).json({ enabled: false, message });
    }
});
app.get("/api/history/:wallet", (req, res) => {
    const walletParam = (req.params.wallet ?? "").trim();
    if (!walletParam) {
        res.status(400).json({ message: "Provide a wallet address" });
        return;
    }
    try {
        const wallet = new web3_js_1.PublicKey(walletParam).toBase58();
        const entries = submissionHistory.getRecentSubmissions(wallet, 10);
        res.json({ submissions: entries });
    }
    catch {
        res.status(400).json({ message: "Invalid wallet address" });
    }
});
app.get("/api/leaderboard", (_req, res) => {
    const leaderboard = leaderboardService.getTop(25);
    res.json({ leaderboard });
});
app.get("/api/identity/:wallet", (req, res) => {
    const walletParam = (req.params.wallet ?? "").trim();
    if (!walletParam) {
        res.status(400).json({ message: "Provide a wallet address" });
        return;
    }
    try {
        const wallet = new web3_js_1.PublicKey(walletParam).toBase58();
        const record = identityRegistry.getIdentity(wallet);
        if (!record) {
            res.status(404).json({ message: "Identity not found" });
            return;
        }
        res.json(record);
    }
    catch {
        res.status(400).json({ message: "Invalid wallet address" });
    }
});
app.get("/api/identities", (_req, res) => {
    const records = identityRegistry.listIdentities();
    res.json({ identities: records });
});
app.post("/api/submissions", rateLimiter_1.ipRateLimiter, async (req, res) => {
    try {
        const result = await submissionService.submit(req.body);
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        logger_1.logger.warn({ err: message }, "Submission failed");
        res.status(400).json({ message });
    }
});
app.use((err, _req, res, _next) => {
    logger_1.logger.error({ err }, "Unhandled error");
    res.status(500).json({ message: "Internal server error" });
});
app.listen(config_1.AppConfig.port, () => {
    logger_1.logger.info(`AgentQuest API listening on port ${config_1.AppConfig.port}`);
});
//# sourceMappingURL=index.js.map