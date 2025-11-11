"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const submissionService_1 = require("../submissionService");
const submissionHistory_1 = require("../submissionHistory");
const quests_1 = require("../quests");
const buildAnswer = (questId) => {
    const quest = quests_1.quests.find((item) => item.id === questId);
    if (!quest) {
        throw new Error("Quest not found in test setup");
    }
    const filler = "The user's answer demonstrates a deep understanding of the task.";
    const keywordString = quest.keywords.join(" ");
    const minLengthPadding = "#".repeat(Math.max(quest.minAnswerLength + 5 - filler.length - keywordString.length, 0));
    return `${filler} ${keywordString} ${minLengthPadding}`;
};
(0, vitest_1.describe)("SubmissionService", () => {
    const questId = quests_1.quests[0]?.id ?? "summarize-news";
    let memoSubmitMock;
    let service;
    let history;
    let authStub;
    let rewardStub;
    const session = {
        token: "session-token",
        wallet: "8ZGZffuCpyaUxpoEqaexfFwaT55dnUGr3hiBkY7b2KV6",
        carvId: "carv_agentquest",
        agentId: "agent_agentquest",
        alias: "hist-user",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString()
    };
    (0, vitest_1.beforeEach)(() => {
        memoSubmitMock = vitest_1.vi.fn().mockResolvedValue({
            status: "skipped",
            message: "memo disabled"
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fakeMemoClient = { submitMemo: memoSubmitMock };
        history = new submissionHistory_1.SubmissionHistory();
        authStub = {
            assertSession: vitest_1.vi.fn().mockReturnValue(session)
        };
        rewardStub = {
            distributeReward: vitest_1.vi.fn().mockResolvedValue({
                status: "skipped",
                amountRaw: "0",
                amountDisplay: "0",
                reason: "disabled",
                mint: "mint"
            })
        };
        service = new submissionService_1.SubmissionService(fakeMemoClient, authStub, rewardStub, history);
    });
    (0, vitest_1.it)("rejects submissions that fail validation", async () => {
        await (0, vitest_1.expect)(service.submit({
            questId,
            sessionToken: session.token,
            displayName: "id",
            answer: "short"
        })).rejects.toThrow(/too short/i);
        (0, vitest_1.expect)(memoSubmitMock).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("creates proof hash, forwards memo text, and stores history", async () => {
        const answer = buildAnswer(questId);
        const result = await service.submit({
            questId,
            sessionToken: session.token,
            displayName: "hist-user",
            answer
        });
        (0, vitest_1.expect)(result.questId).toBe(questId);
        (0, vitest_1.expect)(result.questTitle).toBeDefined();
        (0, vitest_1.expect)(result.proofHash).toHaveLength(64);
        (0, vitest_1.expect)(result.memoText).toMatch(/^AgentQuest:/);
        (0, vitest_1.expect)(result.timestamp).toBeTruthy();
        (0, vitest_1.expect)(result.answerPreview.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(memoSubmitMock).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(memoSubmitMock.mock.calls[0]?.[0]).toMatch(/^AgentQuest:/);
        const stored = history.getRecentSubmissions(session.wallet);
        (0, vitest_1.expect)(stored).toHaveLength(1);
        (0, vitest_1.expect)(stored[0]?.proofHash).toBe(result.proofHash);
        (0, vitest_1.expect)(stored[0]?.questTitle).toBe(result.questTitle);
    });
});
//# sourceMappingURL=submissionService.test.js.map