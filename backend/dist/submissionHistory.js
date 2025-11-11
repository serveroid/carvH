"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionHistory = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const logger_1 = require("./logger");
class SubmissionHistory {
    constructor(maxEntriesPerUser = 20, storageFilePath) {
        this.storage = new Map();
        this.maxEntriesPerUser = maxEntriesPerUser;
        this.storageFilePath = storageFilePath ? node_path_1.default.resolve(storageFilePath) : undefined;
        if (this.storageFilePath) {
            this.ensureStorageDirectory();
            this.loadFromDisk();
        }
    }
    recordSubmission(wallet, entry) {
        const key = wallet.toLowerCase();
        const existing = this.storage.get(key) ?? [];
        const updated = [entry, ...existing].slice(0, this.maxEntriesPerUser);
        this.storage.set(key, updated);
        this.persist();
    }
    getRecentSubmissions(wallet, limit = 10) {
        const key = wallet.toLowerCase();
        const entries = this.storage.get(key) ?? [];
        return entries.slice(0, limit);
    }
    clearUser(wallet) {
        const key = wallet.toLowerCase();
        this.storage.delete(key);
        this.persist();
    }
    getAllSubmissions() {
        const collected = [];
        for (const entries of this.storage.values()) {
            collected.push(...entries);
        }
        return collected;
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
                return;
            }
            const raw = node_fs_1.default.readFileSync(this.storageFilePath, "utf-8");
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw);
            this.storage.clear();
            for (const [key, entries] of Object.entries(parsed)) {
                if (Array.isArray(entries)) {
                    this.storage.set(key.toLowerCase(), entries);
                }
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.warn({ err: message }, "Failed to load submission history from disk");
        }
    }
    persist() {
        if (!this.storageFilePath) {
            return;
        }
        try {
            const plain = Object.fromEntries(this.storage.entries());
            node_fs_1.default.writeFileSync(this.storageFilePath, JSON.stringify(plain, null, 2), "utf-8");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger_1.logger.error({ err: message }, "Failed to persist submission history");
        }
    }
}
exports.SubmissionHistory = SubmissionHistory;
//# sourceMappingURL=submissionHistory.js.map