export type EvaluationResult = {
  score: number;
  reasoning: string;
  usedLLM: boolean;
};

export type RewardReceipt =
  | {
      status: "minted";
      amountRaw: string;
      amountDisplay: string;
      signature: string;
      explorerUrl: string;
      mint: string;
    }
  | {
      status: "skipped";
      amountRaw: string;
      amountDisplay: string;
      reason: string;
      mint: string;
    }
  | {
      status: "failed";
      amountRaw: string;
      amountDisplay: string;
      reason: string;
      mint: string;
    };

export type ProofPayload = {
  questId: string;
  wallet: string;
  carvId: string;
  agentId: string;
  userId: string;
  displayName?: string;
  score: number;
  timestamp: string;
  answerPreview: string;
};

export type SubmissionResponse = {
  questId: string;
  questTitle: string;
  userId: string;
  displayName?: string;
  wallet: string;
  carvId: string;
  agentId: string;
  score: number;
  reasoning: string;
  timestamp: string;
  answerPreview: string;
  proofHash: string;
  transactionSignature?: string;
  explorerUrl?: string;
  memoText?: string;
  usedLLM: boolean;
  onChainStatus: "submitted" | "skipped" | "failed";
  onChainVerified?: boolean;
  onChainMessage?: string;
  reward?: RewardReceipt;
};

export type ChainStatus =
  | {
      enabled: false;
      message: string;
    }
  | {
      enabled: true;
      rpcEndpoint: string;
      wallet: string;
      balanceLamports: number;
      balanceSol: number;
      latestBlockhash: string;
      explorerBaseUrl: string;
      rewardMint?: string;
      rewardBalanceRaw?: string;
      rewardBalanceDisplay?: string;
    };
