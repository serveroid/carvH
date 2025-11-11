import { SubmissionHistory } from "./submissionHistory";
import { formatDisplayAmount } from "./rewardService";
import { SubmissionResponse } from "./types";

export type LeaderboardEntry = {
  wallet: string;
  displayName: string;
  carvId: string;
  agentId: string;
  totalScore: number;
  averageScore: number;
  attempts: number;
  bestScore: number;
  lastSubmission: string;
  totalRewardsRaw: string;
  totalRewardsDisplay: string;
  mintedRewards: number;
  lastRewardSignature?: string;
  rewardMint?: string;
  lastProofHash?: string;
};

type LeaderboardBucket = {
  wallet: string;
  displayName: string;
  carvId: string;
  agentId: string;
  totalScore: number;
  attempts: number;
  bestScore: number;
  lastSubmissionTs: number;
  lastSubmission: string;
  rewardRaw: bigint;
  mintedRewards: number;
  lastRewardSignature?: string;
  rewardMint?: string;
  lastProofHash?: string;
};

export class LeaderboardService {
  constructor(private readonly history: SubmissionHistory, private readonly rewardDecimals: number) {}

  getTop(limit = 10): LeaderboardEntry[] {
    const buckets = new Map<string, LeaderboardBucket>();
    const submissions = this.history.getAllSubmissions();

    for (const submission of submissions) {
      this.processSubmission(buckets, submission);
    }

    const results: LeaderboardEntry[] = Array.from(buckets.values())
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
        totalRewardsDisplay: formatDisplayAmount(bucket.rewardRaw, this.rewardDecimals),
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

  private processSubmission(buckets: Map<string, LeaderboardBucket>, submission: SubmissionResponse) {
    const wallet = (submission.wallet ?? submission.userId).toLowerCase();
    const bucket =
      buckets.get(wallet) ??
      ({
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
      } as LeaderboardBucket);

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
