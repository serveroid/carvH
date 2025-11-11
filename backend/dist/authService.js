"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const bs58_1 = __importDefault(require("bs58"));
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const web3_js_1 = require("@solana/web3.js");
const logger_1 = require("./logger");
const CARV_ID_REGEXP = /^carv_[a-z0-9]{4,64}$/i;
const AGENT_ID_REGEXP = /^agent_[a-z0-9]{4,64}$/i;
const sanitizeAlias = (alias) => {
    if (!alias) {
        return undefined;
    }
    const trimmed = alias.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed.slice(0, 40);
};
const randomBase58 = (bytes = 32) => bs58_1.default.encode(node_crypto_1.default.randomBytes(bytes));
class AuthService {
    constructor(identityRegistry, sessionTtlMinutes, challengeTtlMinutes) {
        this.identityRegistry = identityRegistry;
        this.sessionTtlMinutes = sessionTtlMinutes;
        this.challengeTtlMinutes = challengeTtlMinutes;
        this.challenges = new Map();
        this.sessions = new Map();
    }
    requestChallenge(input) {
        const wallet = this.validateWallet(input.wallet);
        const carvId = this.validateCarvId(input.carvId);
        const agentId = this.validateAgentId(input.agentId);
        const alias = sanitizeAlias(input.alias);
        let identity;
        try {
            identity = this.identityRegistry.assertCanLink({ wallet, carvId, agentId });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn({ wallet, carvId, agentId, err: message }, "Identity challenge rejected");
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
        const expiresAtTs = Date.now() + this.challengeTtlMinutes * 60000;
        const payload = {
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
    verifyChallenge(input) {
        const wallet = this.validateWallet(input.wallet);
        const carvId = this.validateCarvId(input.carvId);
        const agentId = this.validateAgentId(input.agentId);
        const signatureBytes = bs58_1.default.decode(input.signature);
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
        const publicKey = new web3_js_1.PublicKey(wallet);
        const messageBytes = Buffer.from(challenge.message, "utf8");
        const verified = tweetnacl_1.default.sign.detached.verify(messageBytes, Uint8Array.from(signatureBytes), publicKey.toBytes());
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
        logger_1.logger.info({ wallet, carvId, agentId }, "Wallet challenge verified");
        return session;
    }
    getSession(token) {
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
    assertSession(token) {
        const session = this.getSession(token);
        if (!session) {
            throw new Error("Session is invalid. Reconnect your wallet.");
        }
        return session;
    }
    invalidateSession(token) {
        this.sessions.delete(token);
    }
    validateWallet(wallet) {
        try {
            const pubKey = new web3_js_1.PublicKey(wallet);
            return pubKey.toBase58();
        }
        catch {
            throw new Error("Invalid Solana wallet address.");
        }
    }
    validateCarvId(carvId) {
        if (!carvId || !CARV_ID_REGEXP.test(carvId)) {
            throw new Error("CARV ID must use the format carv_xxx.");
        }
        return carvId;
    }
    validateAgentId(agentId) {
        if (!agentId || !AGENT_ID_REGEXP.test(agentId)) {
            throw new Error("Agent ID must use the format agent_xxx.");
        }
        return agentId;
    }
    createSession(identity) {
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + this.sessionTtlMinutes * 60000);
        const session = {
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
    dropExpiredChallenges() {
        const now = Date.now();
        for (const [key, challenge] of this.challenges.entries()) {
            if (challenge.expiresAtTs < now) {
                this.challenges.delete(key);
            }
        }
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=authService.js.map