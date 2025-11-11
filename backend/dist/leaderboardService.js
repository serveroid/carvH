"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardService = void 0;
const rewardService_1 = require("./rewardService");
class LeaderboardService {
    constructor(history, rewardDecimals) {
        this.history = history;
        this.rewardDecimals = rewardDecimals;
    }
    getTop(limit = 10) {
        const buckets = new Map();
        const submissions = this.history.getAllSubmissions();
        for (const submission of submissions) {
            this.processSubmission(buckets, submission);
        }
        const results = Array.from(buckets.values())
            .map((bucket) => ({
            wallet: bucket.wallet,
            displayName: bucket.displayName,
            carvId: bucket.carvId,
            agentId: bucket.agentId,
            totalScore: bucket.totalScore,
            averageScore: Number((bucket.totalScore / Math.max(bucket.attempts, 1)).toFixed(2)),
            attempts: bucket.attempts,
            bestScore: bucket.bestScore,
            lastSubmission: bucket.lastSubmission,
            totalRewardsRaw: bucket.rewardRaw.toString(),
            totalRewardsDisplay: (0, rewardService_1.formatDisplayAmount)(bucket.rewardRaw, this.rewardDecimals),
            mintedRewards: bucket.mintedRewards,
            lastRewardSignature: bucket.lastRewardSignature,
            rewardMint: bucket.rewardMint,
            lastProofHash: bucket.lastProofHash
        }))
            .sort((a, b) => {
            if (b.totalScore !== a.totalScore) {
                return b.totalScore - a.totalScore;
            }
            if (b.mintedRewards !== a.mintedRewards) {
                return b.mintedRewards - a.mintedRewards;
            }
            return new Date(b.lastSubmission).getTime() - new Date(a.lastSubmission).getTime();
        });
        return results.slice(0, limit);
    }
    processSubmission(buckets, submission) {
        const wallet = (submission.wallet ?? submission.userId).toLowerCase();
        const bucket = buckets.get(wallet) ??
            {
                wallet: submission.wallet ?? submission.userId,
                displayName: submission.displayName ?? submission.userId,
                carvId: submission.carvId,
                agentId: submission.agentId,
                totalScore: 0,
                attempts: 0,
                bestScore: 0,
                lastSubmissionTs: 0,
                lastSubmission: submission.timestamp,
                rewardRaw: BigInt(0),
                mintedRewards: 0
            };
        bucket.totalScore += submission.score;
        bucket.attempts += 1;
        bucket.bestScore = Math.max(bucket.bestScore, submission.score);
        const submissionTs = new Date(submission.timestamp).getTime();
        if (submissionTs > bucket.lastSubmissionTs) {
            bucket.lastSubmissionTs = submissionTs;
            bucket.lastSubmission = submission.timestamp;
            bucket.lastProofHash = submission.proofHash;
        }
        if (submission.reward?.status === "minted") {
            bucket.rewardRaw += BigInt(submission.reward.amountRaw);
            bucket.mintedRewards += 1;
            bucket.lastRewardSignature = submission.reward.signature;
            bucket.rewardMint = submission.reward.mint;
        }
        buckets.set(wallet, bucket);
    }
}
exports.LeaderboardService = LeaderboardService;
//# sourceMappingURL=leaderboardService.js.map