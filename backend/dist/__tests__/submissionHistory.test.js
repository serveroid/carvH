"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const submissionHistory_1 = require("../submissionHistory");
const buildEntry = (overrides = {}) => ({
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
    onChainStatus: "skipped",
    memoText: "AgentQuest:hash",
    ...overrides
});
(0, vitest_1.describe)("SubmissionHistory", () => {
    (0, vitest_1.it)("keeps only configured number of entries per user", () => {
        const history = new submissionHistory_1.SubmissionHistory(3);
        for (let i = 0; i < 5; i += 1) {
            history.recordSubmission("8ZGZffuCpyaUxpoEqaexfFwaT55dnUGr3hiBkY7b2KV6", buildEntry({ proofHash: `${i}`.padStart(64, "0"), timestamp: `2024-01-0${i}` }));
        }
        const entries = history.getRecentSubmissions("8ZGZffuCpyaUxpoEqaexfFwaT55dnUGr3hiBkY7b2KV6");
        (0, vitest_1.expect)(entries).toHaveLength(3);
        (0, vitest_1.expect)(entries[0]?.proofHash.includes("4")).toBeTruthy();
        (0, vitest_1.expect)(entries[2]?.proofHash.includes("2")).toBeTruthy();
    });
    (0, vitest_1.it)("stores submissions per user id case-insensitively", () => {
        const history = new submissionHistory_1.SubmissionHistory();
        history.recordSubmission("UserA", buildEntry({ userId: "UserA", wallet: "UserA" }));
        const entries = history.getRecentSubmissions("usera");
        (0, vitest_1.expect)(entries).toHaveLength(1);
    });
    (0, vitest_1.it)("persists to disk when storage path is provided", () => {
        const tempDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), "agentquest-history-"));
        const filePath = node_path_1.default.join(tempDir, "history.json");
        const history = new submissionHistory_1.SubmissionHistory(5, filePath);
        history.recordSubmission("user", buildEntry({ proofHash: "persisted".padEnd(64, "0"), wallet: "user" }));
        const reloaded = new submissionHistory_1.SubmissionHistory(5, filePath);
        const entries = reloaded.getRecentSubmissions("user");
        (0, vitest_1.expect)(entries).toHaveLength(1);
        (0, vitest_1.expect)(entries[0]?.proofHash.startsWith("persisted")).toBeTruthy();
    });
});
//# sourceMappingURL=submissionHistory.test.js.map