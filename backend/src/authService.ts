import crypto from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { IdentityRecord, IdentityRegistry } from "./identityRegistry";
import { logger } from "./logger";

export type WalletChallengeResponse = {
  wallet: string;
  carvId: string;
  agentId: string;
  alias?: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

export type WalletSession = {
  token: string;
  wallet: string;
  carvId: string;
  agentId: string;
  alias?: string;
  issuedAt: string;
  expiresAt: string;
};

type WalletChallenge = WalletChallengeResponse & {
  expiresAtTs: number;
};

const CARV_ID_REGEXP = /^carv_[a-z0-9]{4,64}$/i;
const AGENT_ID_REGEXP = /^agent_[a-z0-9]{4,64}$/i;

const sanitizeAlias = (alias?: string) => {
  if (!alias) {
    return undefined;
  }
  const trimmed = alias.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 40);
};

const randomBase58 = (bytes = 32) => bs58.encode(crypto.randomBytes(bytes));

export class AuthService {
  private readonly challenges = new Map<string, WalletChallenge>();
  private readonly sessions = new Map<string, WalletSession>();

  constructor(
    private readonly identityRegistry: IdentityRegistry,
    private readonly sessionTtlMinutes: number,
    private readonly challengeTtlMinutes: number
  ) {}

  requestChallenge(input: { wallet: string; carvId: string; agentId: string; alias?: string }): WalletChallengeResponse {
    const wallet = this.validateWallet(input.wallet);
    const carvId = this.validateCarvId(input.carvId);
    const agentId = this.validateAgentId(input.agentId);
    const alias = sanitizeAlias(input.alias);

    let identity: IdentityRecord | undefined;
    try {
      identity = this.identityRegistry.assertCanLink({ wallet, carvId, agentId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ wallet, carvId, agentId, err: message }, "Identity challenge rejected");
      throw error;
    }

    const nonce = randomBase58(16);
    const message = [
      "AgentQuest · Wallet Login",
      `Wallet: ${wallet}`,
      `CARV ID: ${carvId}`,
      `Agent ID: ${agentId}`,
      `Alias: ${alias ?? identity?.alias ?? "—"}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`
    ].join("\n");

    const expiresAtTs = Date.now() + this.challengeTtlMinutes * 60_000;
    const payload: WalletChallenge = {
      wallet,
      carvId,
      agentId,
      alias: alias ?? identity?.alias,
      nonce,
      message,
      expiresAt: new Date(expiresAtTs).toISOString(),
      expiresAtTs
    };

    this.challenges.set(wallet.toLowerCase(), payload);
    return payload;
  }

  verifyChallenge(input: { wallet: string; carvId: string; agentId: string; signature: string; nonce: string }) {
    const wallet = this.validateWallet(input.wallet);
    const carvId = this.validateCarvId(input.carvId);
    const agentId = this.validateAgentId(input.agentId);
    const signatureBytes = bs58.decode(input.signature);

    this.dropExpiredChallenges();

    const challenge = this.challenges.get(wallet.toLowerCase());
    if (!challenge) {
      throw new Error("Challenge not found or expired. Request a new one.");
    }

    if (challenge.nonce !== input.nonce) {
      throw new Error("Nonce mismatch. Request a fresh challenge.");
    }

    if (challenge.carvId.toLowerCase() !== carvId.toLowerCase() || challenge.agentId.toLowerCase() !== agentId.toLowerCase()) {
      throw new Error("CARV ID or Agent ID does not match the requested challenge.");
    }

    if (challenge.expiresAtTs < Date.now()) {
      this.challenges.delete(wallet.toLowerCase());
      throw new Error("Challenge expired. Request a new one.");
    }

    const publicKey = new PublicKey(wallet);
    const messageBytes = Buffer.from(challenge.message, "utf8");
    const verified = nacl.sign.detached.verify(
      messageBytes,
      Uint8Array.from(signatureBytes),
      publicKey.toBytes()
    );
    if (!verified) {
      throw new Error("Signature verification failed. Make sure you signed the latest challenge.");
    }

    const identity = this.identityRegistry.registerIdentity({
      wallet,
      carvId,
      agentId,
      alias: challenge.alias
    });

    const session = this.createSession(identity);
    this.challenges.delete(wallet.toLowerCase());
    logger.info({ wallet, carvId, agentId }, "Wallet challenge verified");

    return session;
  }

  getSession(token: string): WalletSession | undefined {
    const session = this.sessions.get(token);
    if (!session) {
      return undefined;
    }
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  assertSession(token: string): WalletSession {
    const session = this.getSession(token);
    if (!session) {
      throw new Error("Session is invalid. Reconnect your wallet.");
    }
    return session;
  }

  invalidateSession(token: string) {
    this.sessions.delete(token);
  }

  private validateWallet(wallet: string) {
    try {
      const pubKey = new PublicKey(wallet);
      return pubKey.toBase58();
    } catch {
      throw new Error("Invalid Solana wallet address.");
    }
  }

  private validateCarvId(carvId: string) {
    if (!carvId || !CARV_ID_REGEXP.test(carvId)) {
      throw new Error("CARV ID must use the format carv_xxx.");
    }
    return carvId;
  }

  private validateAgentId(agentId: string) {
    if (!agentId || !AGENT_ID_REGEXP.test(agentId)) {
      throw new Error("Agent ID must use the format agent_xxx.");
    }
    return agentId;
  }

  private createSession(identity: IdentityRecord): WalletSession {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.sessionTtlMinutes * 60_000);

    const session: WalletSession = {
      token: randomBase58(24),
      wallet: identity.wallet,
      carvId: identity.carvId,
      agentId: identity.agentId,
      alias: identity.alias,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    this.sessions.set(session.token, session);
    return session;
  }

  private dropExpiredChallenges() {
    const now = Date.now();
    for (const [key, challenge] of this.challenges.entries()) {
      if (challenge.expiresAtTs < now) {
        this.challenges.delete(key);
      }
    }
  }
}
