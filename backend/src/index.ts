import { PublicKey } from "@solana/web3.js";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { AppConfig } from "./config";
import { MemoClient } from "./memoClient";
import { quests } from "./quests";
import { SubmissionService } from "./submissionService";
import { clearExpiredSubmissions, ipRateLimiter } from "./rateLimiter";
import { logger } from "./logger";
import { SubmissionHistory } from "./submissionHistory";
import { IdentityRegistry } from "./identityRegistry";
import { AuthService } from "./authService";
import { RewardService } from "./rewardService";
import { LeaderboardService } from "./leaderboardService";
import { CarvOAuthService } from "./carvOAuthService";

const app = express();

app.use(cors());
app.use(express.json({ limit: "16kb" }));
app.use(
  morgan("tiny", {
    stream: {
      write: (message: string) => logger.info({ msg: message.trim() })
    }
  })
);

const memoClient = new MemoClient(AppConfig);
const submissionHistory = new SubmissionHistory(20, AppConfig.historyStoragePath);
const identityRegistry = new IdentityRegistry(AppConfig.identityStoragePath);
const authService = new AuthService(identityRegistry, AppConfig.sessionTtlMinutes, AppConfig.challengeTtlMinutes);
const rewardService = new RewardService(AppConfig, memoClient);
const leaderboardService = new LeaderboardService(submissionHistory, AppConfig.rewardTokenDecimals);
const submissionService = new SubmissionService(memoClient, authService, rewardService, submissionHistory);
const carvOAuthService = new CarvOAuthService(AppConfig);

setInterval(() => clearExpiredSubmissions(), 60_000).unref();

app.get("/health", (_, res) => {
  res.json({ status: "ok", onChain: AppConfig.isOnChainEnabled });
});

app.get("/api/quests", (_, res) => {
  res.json(quests);
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
      } else if (AppConfig.rewardTokenMint) {
        status.rewardMint = AppConfig.rewardTokenMint;
      }
    }
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch status";
    logger.error({ err: message }, "Chain status endpoint failed");
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
    const wallet = new PublicKey(walletParam).toBase58();
    const entries = submissionHistory.getRecentSubmissions(wallet, 10);
    res.json({ submissions: entries });
  } catch {
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
    const wallet = new PublicKey(walletParam).toBase58();
    const record = identityRegistry.getIdentity(wallet);
    if (!record) {
      res.status(404).json({ message: "Identity not found" });
      return;
    }
    res.json(record);
  } catch {
    res.status(400).json({ message: "Invalid wallet address" });
  }
});

app.get("/api/identities", (_req, res) => {
  const records = identityRegistry.listIdentities();
  res.json({ identities: records });
});

app.post("/api/submissions", ipRateLimiter, async (req, res) => {
  try {
    const result = await submissionService.submit(req.body);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    logger.warn({ err: message }, "Submission failed");
    res.status(400).json({ message });
  }
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ message: "Internal server error" });
});

app.listen(AppConfig.port, () => {
  logger.info(`AgentQuest API listening on port ${AppConfig.port}`);
});
