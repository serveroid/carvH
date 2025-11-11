import { describe, expect, it, beforeEach, vi } from "vitest";
import { SubmissionService } from "../submissionService";
import { SubmissionHistory } from "../submissionHistory";
import { quests } from "../quests";
import type { MemoResult } from "../memoClient";
import type { AuthService } from "../authService";
import type { RewardService } from "../rewardService";

const buildAnswer = (questId: string) => {
  const quest = quests.find((item) => item.id === questId);
  if (!quest) {
    throw new Error("Quest not found in test setup");
  }

  const filler = "The user's answer demonstrates a deep understanding of the task.";
  const keywordString = quest.keywords.join(" ");
  const minLengthPadding = "#".repeat(Math.max(quest.minAnswerLength + 5 - filler.length - keywordString.length, 0));
  return `${filler} ${keywordString} ${minLengthPadding}`;
};

describe("SubmissionService", () => {
  const questId = quests[0]?.id ?? "summarize-news";
  let memoSubmitMock: ReturnType<typeof vi.fn<(memo: string) => Promise<MemoResult>>>;
  let service: SubmissionService;
  let history: SubmissionHistory;
  let authStub: Pick<AuthService, "assertSession">;
  let rewardStub: Pick<RewardService, "distributeReward">;
  const session = {
    token: "session-token",
    wallet: "8ZGZffuCpyaUxpoEqaexfFwaT55dnUGr3hiBkY7b2KV6",
    carvId: "carv_agentquest",
    agentId: "agent_agentquest",
    alias: "hist-user",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };

  beforeEach(() => {
    memoSubmitMock = vi.fn<(memo: string) => Promise<MemoResult>>().mockResolvedValue({
      status: "skipped",
      message: "memo disabled"
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeMemoClient = { submitMemo: memoSubmitMock } as any;
    history = new SubmissionHistory();
    authStub = {
      assertSession: vi.fn().mockReturnValue(session)
    };
    rewardStub = {
      distributeReward: vi.fn().mockResolvedValue({
        status: "skipped",
        amountRaw: "0",
        amountDisplay: "0",
        reason: "disabled",
        mint: "mint"
      })
    };
    service = new SubmissionService(fakeMemoClient, authStub as AuthService, rewardStub as RewardService, history);
  });

  it("rejects submissions that fail validation", async () => {
    await expect(
      service.submit({
        questId,
        sessionToken: session.token,
        displayName: "id",
        answer: "short"
      })
    ).rejects.toThrow(/too short/i);
    expect(memoSubmitMock).not.toHaveBeenCalled();
  });

  it("creates proof hash, forwards memo text, and stores history", async () => {
    const answer = buildAnswer(questId);

    const result = await service.submit({
      questId,
      sessionToken: session.token,
      displayName: "hist-user",
      answer
    });

    expect(result.questId).toBe(questId);
    expect(result.questTitle).toBeDefined();
    expect(result.proofHash).toHaveLength(64);
    expect(result.memoText).toMatch(/^AgentQuest:/);
    expect(result.timestamp).toBeTruthy();
    expect(result.answerPreview.length).toBeGreaterThan(0);
    expect(memoSubmitMock).toHaveBeenCalledTimes(1);
    expect(memoSubmitMock.mock.calls[0]?.[0]).toMatch(/^AgentQuest:/);

    const stored = history.getRecentSubmissions(session.wallet);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.proofHash).toBe(result.proofHash);
    expect(stored[0]?.questTitle).toBe(result.questTitle);
  });
});
