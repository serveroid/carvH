"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const zod_1 = require("zod");
const quests_1 = require("./quests");
const rateLimiter_1 = require("./rateLimiter");
const evaluator_1 = require("./evaluator");
const logger_1 = require("./logger");
const SubmissionSchema = zod_1.z.object({
    questId: zod_1.z.string().trim().min(1, "Select a quest"),
    sessionToken: zod_1.z.string().trim().min(10, "Reconnect your wallet."),
    displayName: zod_1.z
        .string()
        .trim()
        .min(2, "Display name must be at least 2 characters long")
        .max(80, "Display name is too long")
        .optional(),
    answer: zod_1.z.string().trim().min(10, "Answer is too short").max(4000, "Answer is too long")
});
const formatPreview = (text, limit) => {
    const sanitized = text.replace(/\s+/g, " ").trim();
    if (sanitized.length <= limit) {
        return sanitized;
    }
    return `${sanitized.slice(0, limit)}…`;
};
const buildProofPayload = (quest, session, displayName, answer, score) => {
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
const serializePayload = (payload) => JSON.stringify(payload);
const hashPayload = (payload) => node_crypto_1.default.createHash("sha256").update(serializePayload(payload)).digest("hex");
class SubmissionService {
    constructor(memoClient, authService, rewardService, history) {
        this.memoClient = memoClient;
        this.authService = authService;
        this.rewardService = rewardService;
        this.history = history;
    }
    async submit(rawInput) {
        const parsedResult = SubmissionSchema.safeParse(rawInput);
        if (!parsedResult.success) {
            const message = parsedResult.error.errors.map((err) => err.message).join(". ");
            logger_1.logger.warn({ validationError: parsedResult.error.flatten() }, "Submission validation failed");
            throw new Error(message);
        }
        const input = parsedResult.data;
        const session = this.authService.assertSession(input.sessionToken);
        const quest = quests_1.questMap.get(input.questId);
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
        const rateLimitResult = (0, rateLimiter_1.checkUserQuestRateLimit)(quest.id, session.wallet);
        if (!rateLimitResult.allowed) {
            throw new Error(rateLimitResult.message ?? "Too many attempts");
        }
        const evaluation = await (0, evaluator_1.evaluateAnswer)(quest, input.answer);
        const proofPayload = buildProofPayload(quest, session, displayName, input.answer, evaluation.score);
        const proofHash = hashPayload(proofPayload);
        const memoText = `AgentQuest:${proofHash}`;
        logger_1.logger.info({
            questId: quest.id,
            wallet: session.wallet,
            score: evaluation.score,
            usedLLM: evaluation.usedLLM
        }, "Evaluated submission");
        const memoResult = await this.memoClient.submitMemo(memoText);
        const response = {
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
        }
        else {
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
exports.SubmissionService = SubmissionService;
//# sourceMappingURL=submissionService.js.map