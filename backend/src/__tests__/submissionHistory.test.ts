import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SubmissionHistory } from "../submissionHistory";
import type { SubmissionHistoryEntry } from "../submissionHistory";

const buildEntry = (overrides: Partial<SubmissionHistoryEntry> = {}): SubmissionHistoryEntry => ({
  questId: "quest",
  questTitle: "Quest Title",
  userId: "user",
  displayName: "user",
  wallet: "8ZGZffuCpyaUxpoEqaexfFwaT55dnUGr3hiBkY7b2KV6",
  carvId: "carv_agentquest",
  agentId: "agent_agentquest",
  score: 80,
  reasoning: "ok",
  timestamp: new Date().toISOString(),
  answerPreview: "preview",
  proofHash: "a".repeat(64),
  usedLLM: false,
  onChainStatus: "skipped" as const,
  memoText: "AgentQuest:hash",
  ...overrides
});

describe("SubmissionHistory", () => {
  it("keeps only configured number of entries per user", () => {
    const history = new SubmissionHistory(3);
    for (let i = 0; i < 5; i += 1) {
      history.recordSubmission(
        "8ZGZffuCpyaUxpoEqaexfFwaT55dnUGr3hiBkY7b2KV6",
        buildEntry({ proofHash: `${i}`.padStart(64, "0"), timestamp: `2024-01-0${i}` })
      );
    }

    const entries = history.getRecentSubmissions("8ZGZffuCpyaUxpoEqaexfFwaT55dnUGr3hiBkY7b2KV6");
    expect(entries).toHaveLength(3);
    expect(entries[0]?.proofHash.includes("4")).toBeTruthy();
    expect(entries[2]?.proofHash.includes("2")).toBeTruthy();
  });

  it("stores submissions per user id case-insensitively", () => {
    const history = new SubmissionHistory();
    history.recordSubmission("UserA", buildEntry({ userId: "UserA", wallet: "UserA" }));
    const entries = history.getRecentSubmissions("usera");
    expect(entries).toHaveLength(1);
  });

  it("persists to disk when storage path is provided", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentquest-history-"));
    const filePath = path.join(tempDir, "history.json");
    const history = new SubmissionHistory(5, filePath);

    history.recordSubmission("user", buildEntry({ proofHash: "persisted".padEnd(64, "0"), wallet: "user" }));

    const reloaded = new SubmissionHistory(5, filePath);
    const entries = reloaded.getRecentSubmissions("user");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.proofHash.startsWith("persisted")).toBeTruthy();
  });
});
