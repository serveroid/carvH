import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";

export type IdentityRecord = {
  wallet: string;
  carvId: string;
  agentId: string;
  alias?: string;
  registeredAt: string;
  lastVerifiedAt: string;
  totalVerifications: number;
};

type IdentityStorageShape = {
  walletToIdentity: Record<string, IdentityRecord>;
  carvIdToWallet: Record<string, string>;
  agentIdToWallet: Record<string, string>;
};

const DEFAULT_STORAGE: IdentityStorageShape = {
  walletToIdentity: {},
  carvIdToWallet: {},
  agentIdToWallet: {}
};

export class IdentityRegistry {
  private readonly storageFilePath?: string;
  private readonly walletToIdentity = new Map<string, IdentityRecord>();
  private readonly carvIdToWallet = new Map<string, string>();
  private readonly agentIdToWallet = new Map<string, string>();

  constructor(storageFilePath?: string) {
    this.storageFilePath = storageFilePath ? path.resolve(storageFilePath) : undefined;
    if (this.storageFilePath) {
      this.ensureStorageDirectory();
      this.loadFromDisk();
    }
  }

  getIdentity(wallet: string): IdentityRecord | undefined {
    return this.walletToIdentity.get(wallet.toLowerCase());
  }

  getIdentityByCarvId(carvId: string): IdentityRecord | undefined {
    const wallet = this.carvIdToWallet.get(carvId.toLowerCase());
    return wallet ? this.getIdentity(wallet) : undefined;
  }

  getIdentityByAgentId(agentId: string): IdentityRecord | undefined {
    const wallet = this.agentIdToWallet.get(agentId.toLowerCase());
    return wallet ? this.getIdentity(wallet) : undefined;
  }

  assertCanLink(input: { wallet: string; carvId: string; agentId: string }): IdentityRecord | undefined {
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
  registerIdentity(input: { wallet: string; carvId: string; agentId: string; alias?: string }): IdentityRecord {
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
    const record: IdentityRecord = {
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

  touchIdentity(record: IdentityRecord) {
    record.lastVerifiedAt = new Date().toISOString();
    record.totalVerifications += 1;
    this.persist();
  }

  listIdentities(): IdentityRecord[] {
    return Array.from(this.walletToIdentity.values());
  }

  private normalizeKeys(input: { wallet: string; carvId: string; agentId: string }) {
    return {
      walletKey: input.wallet.toLowerCase(),
      carvKey: input.carvId.toLowerCase(),
      agentKey: input.agentId.toLowerCase()
    };
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
        fs.writeFileSync(this.storageFilePath, JSON.stringify(DEFAULT_STORAGE, null, 2), "utf-8");
      }
      const raw = fs.readFileSync(this.storageFilePath, "utf-8");
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as IdentityStorageShape;
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ err: message }, "Failed to load identity registry from disk");
    }
  }

  private persist() {
    if (!this.storageFilePath) {
      return;
    }
    try {
      const payload: IdentityStorageShape = {
        walletToIdentity: Object.fromEntries(this.walletToIdentity.entries()),
        carvIdToWallet: Object.fromEntries(this.carvIdToWallet.entries()),
        agentIdToWallet: Object.fromEntries(this.agentIdToWallet.entries())
      };
      fs.writeFileSync(this.storageFilePath, JSON.stringify(payload, null, 2), "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: message }, "Failed to persist identity registry");
    }
  }
}
