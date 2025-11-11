import fs from "node:fs";
import path from "node:path";
import { SubmissionResponse } from "./types";
import { logger } from "./logger";

export type SubmissionHistoryEntry = SubmissionResponse;

export class SubmissionHistory {
  private readonly maxEntriesPerUser: number;
  private readonly storageFilePath?: string;
  private readonly storage = new Map<string, SubmissionHistoryEntry[]>();

  constructor(maxEntriesPerUser = 20, storageFilePath?: string) {
    this.maxEntriesPerUser = maxEntriesPerUser;
    this.storageFilePath = storageFilePath ? path.resolve(storageFilePath) : undefined;

    if (this.storageFilePath) {
      this.ensureStorageDirectory();
      this.loadFromDisk();
    }
  }

  recordSubmission(wallet: string, entry: SubmissionHistoryEntry) {
    const key = wallet.toLowerCase();
    const existing = this.storage.get(key) ?? [];
    const updated = [entry, ...existing].slice(0, this.maxEntriesPerUser);
    this.storage.set(key, updated);
    this.persist();
  }

  getRecentSubmissions(wallet: string, limit = 10): SubmissionHistoryEntry[] {
    const key = wallet.toLowerCase();
    const entries = this.storage.get(key) ?? [];
    return entries.slice(0, limit);
  }

  clearUser(wallet: string) {
    const key = wallet.toLowerCase();
    this.storage.delete(key);
    this.persist();
  }

  getAllSubmissions(): SubmissionHistoryEntry[] {
    const collected: SubmissionHistoryEntry[] = [];
    for (const entries of this.storage.values()) {
      collected.push(...entries);
    }
    return collected;
  }

  private ensureStorageDirectory() {
    if (!this.storageFilePath) {
      return;
    }

    const dir = path.dirname(this.storageFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadFromDisk() {
    if (!this.storageFilePath) {
      return;
    }

    try {
      if (!fs.existsSync(this.storageFilePath)) {
        return;
      }
      const raw = fs.readFileSync(this.storageFilePath, "utf-8");
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, SubmissionHistoryEntry[]>;
      this.storage.clear();
      for (const [key, entries] of Object.entries(parsed)) {
        if (Array.isArray(entries)) {
          this.storage.set(key.toLowerCase(), entries);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ err: message }, "Failed to load submission history from disk");
    }
  }

  private persist() {
    if (!this.storageFilePath) {
      return;
    }

    try {
      const plain = Object.fromEntries(this.storage.entries());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(plain, null, 2), "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: message }, "Failed to persist submission history");
    }
  }
}
