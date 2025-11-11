"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CarvOAuthService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const logger_1 = require("./logger");
const normalizeString = (value) => {
    if (typeof value === "string") {
        return value;
    }
    return undefined;
};
class CarvOAuthService {
    constructor(config) {
        this.config = config;
        this.pendingStates = new Map();
        this.stateTtlMs = 10 * 60 * 1000;
        this.enabled = config.carvOAuth.enabled;
    }
    isEnabled() {
        return this.enabled;
    }
    createAuthorizationUrl() {
        if (!this.enabled) {
            throw new Error("CARV OAuth is not configured on the server");
        }
        const state = node_crypto_1.default.randomBytes(16).toString("hex");
        this.pendingStates.set(state, Date.now() + this.stateTtlMs);
        this.cleanupStates();
        const url = new URL(this.config.carvOAuth.authorizeUrl);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", this.config.carvOAuth.clientId);
        url.searchParams.set("redirect_uri", this.config.carvOAuth.redirectUri);
        url.searchParams.set("scope", this.config.carvOAuth.scopes ?? "basic");
        url.searchParams.set("state", state);
        return {
            state,
            url: url.toString()
        };
    }
    async exchangeCode(input) {
        if (!this.enabled) {
            throw new Error("CARV OAuth is not configured on the server");
        }
        const matched = this.consumeState(input.state);
        if (!matched) {
            throw new Error("OAuth state was not found or has expired. Please restart the login.");
        }
        const token = await this.fetchToken(input.code);
        const profile = await this.fetchProfile(token.access_token);
        if (!profile.carvId || !profile.agentId) {
            throw new Error("CARV OAuth response does not contain required identifiers.");
        }
        return profile;
    }
    consumeState(state) {
        const stored = this.pendingStates.get(state);
        if (!stored) {
            return false;
        }
        this.pendingStates.delete(state);
        return stored > Date.now();
    }
    cleanupStates() {
        const now = Date.now();
        for (const [state, expiresAt] of this.pendingStates.entries()) {
            if (expiresAt < now) {
                this.pendingStates.delete(state);
            }
        }
    }
    async fetchToken(code) {
        const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: this.config.carvOAuth.redirectUri ?? "",
            client_id: this.config.carvOAuth.clientId ?? "",
            client_secret: this.config.carvOAuth.clientSecret ?? ""
        });
        const response = await fetch(this.config.carvOAuth.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body
        });
        if (!response.ok) {
            const message = await response.text().catch(() => response.statusText);
            logger_1.logger.warn({ status: response.status, message }, "CARV OAuth token exchange failed");
            throw new Error("Failed to exchange CARV OAuth code.");
        }
        const payload = (await response.json());
        if (!payload.access_token) {
            throw new Error("CARV OAuth response does not include an access token.");
        }
        return payload;
    }
    async fetchProfile(accessToken) {
        const response = await fetch(this.config.carvOAuth.profileUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json"
            }
        });
        if (!response.ok) {
            const message = await response.text().catch(() => response.statusText);
            logger_1.logger.warn({ status: response.status, message }, "CARV OAuth profile fetch failed");
            throw new Error("Failed to fetch CARV profile.");
        }
        const payload = await response.json();
        return this.normalizeProfile(payload);
    }
    normalizeProfile(payload) {
        const record = (typeof payload === "object" && payload !== null ? payload : {});
        const data = (record.data && typeof record.data === "object" ? record.data : record) ?? {};
        const carvId = normalizeString(data.carvId) ?? normalizeString(data.carv_id) ?? normalizeString(record.carvId) ?? normalizeString(record.carv_id);
        const agentId = normalizeString(data.agentId) ??
            normalizeString(data.agent_id) ??
            normalizeString(record.agentId) ??
            normalizeString(record.agent_id);
        const alias = normalizeString(data.alias) ??
            normalizeString(data.displayName) ??
            normalizeString(record.alias) ??
            normalizeString(record.displayName);
        let wallet = normalizeString(data.wallet) ??
            normalizeString(data.walletAddress) ??
            normalizeString(record.wallet) ??
            normalizeString(record.walletAddress);
        if (!wallet) {
            const walletsArray = (Array.isArray(data.wallets) ? data.wallets : Array.isArray(record.wallets) ? record.wallets : undefined) ?? [];
            if (walletsArray.length > 0) {
                const first = walletsArray[0];
                wallet = normalizeString(first.address) ?? normalizeString(first.wallet);
            }
        }
        if (!carvId) {
            throw new Error("CARV OAuth profile does not contain CARV ID.");
        }
        if (!agentId) {
            throw new Error("CARV OAuth profile does not contain Agent ID.");
        }
        return {
            carvId,
            agentId,
            alias: alias ?? undefined,
            wallet: wallet ?? undefined
        };
    }
}
exports.CarvOAuthService = CarvOAuthService;
//# sourceMappingURL=carvOAuthService.js.map