import crypto from "node:crypto";
import { z } from "zod";
import { MemoClient } from "./memoClient";
import { Quest, questMap } from "./quests";
import { checkUserQuestRateLimit } from "./rateLimiter";
import { evaluateAnswer } from "./evaluator";
import { logger } from "./logger";
import { ProofPayload, SubmissionResponse } from "./types";
import { SubmissionHistory } from "./submissionHistory";
import { AuthService } from "./authService";
import { RewardService } from "./rewardService";

const SubmissionSchema = z.object({
  questId: z.string().trim().min(1, "Select a quest"),
  sessionToken: z.string().trim().min(10, "Reconnect your wallet."),
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters long")
    .max(80, "Display name is too long")
    .optional(),
  answer: z.string().trim().min(10, "Answer is too short").max(4000, "Answer is too long")
});

export type SubmissionInput = z.infer<typeof SubmissionSchema>;

const formatPreview = (text: string, limit: number) => {
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (sanitized.length <= limit) {
    return sanitized;
  }
  return `${sanitized.slice(0, limit)}…`;
};

const buildProofPayload = (
  quest: Quest,
  session: { wallet: string; carvId: string; agentId: string; alias?: string },
  displayName: string,
  answer: string,
  score: number
): ProofPayload => {
  const timestamp = new Date().toISOString();
  return {
    questId: quest.id,
    wallet: session.wallet,
    carvId: session.carvId,
    agentId: session.agentId,
    userId: displayName,
    displayName,
    score,
    timestamp,
    answerPreview: formatPreview(answer, quest.previewLimit)
  };
};

const serializePayload = (payload: ProofPayload) => JSON.stringify(payload);

const hashPayload = (payload: ProofPayload) =>
  crypto.createHash("sha256").update(serializePayload(payload)).digest("hex");

export class SubmissionService {
  constructor(
    private readonly memoClient: MemoClient,
    private readonly authService: AuthService,
    private readonly rewardService: RewardService,
    private readonly history?: SubmissionHistory
  ) {}

  async submit(rawInput: unknown): Promise<SubmissionResponse> {
    const parsedResult = SubmissionSchema.safeParse(rawInput);
    if (!parsedResult.success) {
      const message = parsedResult.error.errors.map((err) => err.message).join(". ");
      logger.warn({ validationError: parsedResult.error.flatten() }, "Submission validation failed");
      throw new Error(message);
    }

    const input = parsedResult.data;
    const session = this.authService.assertSession(input.sessionToken);
    const quest = questMap.get(input.questId);

    if (!quest) {
      throw new Error("Quest not found");
    }

    if (input.answer.length < quest.minAnswerLength) {
      throw new Error(`Answer must be at least ${quest.minAnswerLength} characters for this quest`);
    }

    if (input.answer.length > quest.maxAnswerLength) {
      throw new Error(`Answer exceeds the maximum allowed length (${quest.maxAnswerLength} characters)`);
    }

    const displayName = input.displayName?.trim() || session.alias || session.wallet;

    const rateLimitResult = checkUserQuestRateLimit(quest.id, session.wallet);
    if (!rateLimitResult.allowed) {
      throw new Error(rateLimitResult.message ?? "Too many attempts");
    }

    const evaluation = await evaluateAnswer(quest, input.answer);
    const proofPayload = buildProofPayload(quest, session, displayName, input.answer, evaluation.score);
    const proofHash = hashPayload(proofPayload);
    const memoText = `AgentQuest:${proofHash}`;

    logger.info(
      {
        questId: quest.id,
        wallet: session.wallet,
        score: evaluation.score,
        usedLLM: evaluation.usedLLM
      },
      "Evaluated submission"
    );

    const memoResult = await this.memoClient.submitMemo(memoText);

    const response: SubmissionResponse = {
      questId: quest.id,
      questTitle: quest.title,
      userId: displayName,
      displayName,
      wallet: session.wallet,
      carvId: session.carvId,
      agentId: session.agentId,
      score: evaluation.score,
      reasoning: evaluation.reasoning,
      timestamp: proofPayload.timestamp,
      answerPreview: proofPayload.answerPreview,
      proofHash,
      memoText,
      usedLLM: evaluation.usedLLM,
      onChainStatus: memoResult.status,
      onChainVerified: memoResult.status === "submitted" ? memoResult.memoVerified : undefined
    };

    if (memoResult.status === "submitted") {
      response.transactionSignature = memoResult.signature;
      response.explorerUrl = memoResult.explorerUrl;
    } else {
      response.onChainMessage = memoResult.message;
    }

    const reward = await this.rewardService.distributeReward({
      wallet: session.wallet,
      score: evaluation.score
    });

    response.reward = reward;

    this.history?.recordSubmission(session.wallet, response);

    return response;
  }
}
