"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityRegistry = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const logger_1 = require("./logger");
const DEFAULT_STORAGE = {
    walletToIdentity: {},
    carvIdToWallet: {},
    agentIdToWallet: {}
};
class IdentityRegistry {
    constructor(storageFilePath) {
        this.walletToIdentity = new Map();
        this.carvIdToWallet = new Map();
        this.agentIdToWallet = new Map();
        this.storageFilePath = storageFilePath ? node_path_1.default.resolve(storageFilePath) : undefined;
        if (this.storageFilePath) {
            this.ensureStorageDirectory();
            this.loadFromDisk();
        }
    }
    getIdentity(wallet) {
        return this.walletToIdentity.get(wallet.toLowerCase());
    }
    getIdentityByCarvId(carvId) {
        const wallet = this.carvIdToWallet.get(carvId.toLowerCase());
        return wallet ? this.getIdentity(wallet) : undefined;
    }
    getIdentityByAgentId(agentId) {
        const wallet = this.agentIdToWallet.get(agentId.toLowerCase());
        return wallet ? this.getIdentity(wallet) : undefined;
    }
    assertCanLink(input) {
        const { walletKey, carvKey, agentKey } = this.normalizeKeys(input);
        const existing = this.walletToIdentity.get(walletKey);
        if (existing) {
            if (existing.carvId.toLowerCase() !== carvKey || existing.agentId.toLowerCase() !== agentKey) {
                throw new Error("Detected a CARV ID or Agent ID conflict for this wallet. Contact support for review.");
            }
            return existing;
        }
        const carvOwner = this.carvIdToWallet.get(carvKey);
        if (carvOwner && carvOwner !== walletKey) {
            throw new Error("CARV ID is already linked to another wallet. Possible multi-account activity.");
        }
        const agentOwner = this.agentIdToWallet.get(agentKey);
        if (agentOwner && agentOwner !== walletKey) {
            throw new Error("Agent ID is already linked to another wallet. Try a different ID or contact support.");
        }
        return undefined;
    }
    /** Registers identity or validates existing mapping. Throws on conflicts. */
    registerIdentity(input) {
        const { walletKey, carvKey, agentKey } = this.normalizeKeys(input);
        const existing = this.walletToIdentity.get(walletKey);
        if (existing) {
            if (existing.carvId.toLowerCase() !== carvKey || existing.agentId.toLowerCase() !== agentKey) {
                throw new Error("Detected a CARV ID or Agent ID conflict for this wallet. Contact support for review.");
            }
            existing.alias = input.alias ?? existing.alias;
            this.touchIdentity(existing);
            this.persist();
            return existing;
        }
        this.assertCanLink(input);
        const timestamp = new Date().toISOString();
        const record = {
            wallet: input.wallet,
            carvId: input.carvId,
            agentId: input.agentId,
            alias: input.alias,
            registeredAt: timestamp,
            lastVerifiedAt: timestamp,
            totalVerifications: 1
        };
        this.walletToIdentity.set(walletKey, record);
        this.carvIdToWallet.set(carvKey, walletKey);
        this.agentIdToWallet.set(agentKey, walletKey);
        this.persist();
        return record;
    }
    touchIdentity(record) {
        record.lastVerifiedAt = new Date().toISOString();
        record.totalVerifications += 1;
        this.persist();
    }
    listIdentities() {
        return Array.from(this.walletToIdentity.values());
    }
    normalizeKeys(input) {
        return {
            walletKey: input.wallet.toLowerCase(),
            carvKey: input.carvId.toLowerCase(),
            agentKey: input.agentId.toLowerCase()
        };
    }
    ensureStorageDirectory() {
        if (!this.storageFilePath) {
            return;
        }
        const dir = node_path_1.default.dirname(this.storageFilePath);
        if (!node_fs_1.default.existsSync(dir)) {
            node_fs_1.default.mkdirSync(dir, { recursive: true });
        }
    }
    loadFromDisk() {
        if (!this.storageFilePath) {
            return;
        }
        try {
            if (!node_fs_1.default.existsSync(this.storageFilePath)) {
                node_fs_1.default.writeFileSync(this.storageFilePath, JSON.stringify(DEFAULT_STORAGE, null, 2), "utf-8");
            }
            const raw = node_fs_1.default.readFileSync(this.storageFilePath, "utf-8");
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw);
            this.walletToIdentity.clear();
            this.carvIdToWallet.clear();
            this.agentIdToWallet.clear();
            for (const record of Object.values(parsed.walletToIdentity ?? {})) {
                if (record?.wallet && record?.carvId && record?.agentId) {
                    this.walletToIdentity.set(record.wallet.toLowerCase(), record);
                    this.carvIdToWallet.set(record.carvId.toLowerCase(), record.wallet.toLowerCase());
                    this.agentIdToWallet.set(record.agentId.toLowerCase(), record.wallet.toLowerCase());
                }
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn({ err: message }, "Failed to load identity registry from disk");
        }
    }
    persist() {
        if (!this.storageFilePath) {
            return;
        }
        try {
            const payload = {
                walletToIdentity: Object.fromEntries(this.walletToIdentity.entries()),
                carvIdToWallet: Object.fromEntries(this.carvIdToWallet.entries()),
                agentIdToWallet: Object.fromEntries(this.agentIdToWallet.entries())
            };
            node_fs_1.default.writeFileSync(this.storageFilePath, JSON.stringify(payload, null, 2), "utf-8");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error({ err: message }, "Failed to persist identity registry");
        }
    }
}
exports.IdentityRegistry = IdentityRegistry;
//# sourceMappingURL=identityRegistry.js.map