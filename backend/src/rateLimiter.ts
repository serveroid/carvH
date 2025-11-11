import rateLimit from "express-rate-limit";

const SUBMISSION_WINDOW_MS = 60_000; // 1 minute between attempts per quest/user

type SubmissionKey = string;

const recentSubmissions = new Map<SubmissionKey, number>();

export const ipRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_, res) => {
    res.status(429).json({
      message: "Too many attempts. Please try again in a few minutes."
    });
  }
});

export const checkUserQuestRateLimit = (questId: string, userId: string): { allowed: boolean; message?: string } => {
  const key = `${questId}:${userId}`.toLowerCase();
  const now = Date.now();
  const lastSubmission = recentSubmissions.get(key);

  if (lastSubmission && now - lastSubmission < SUBMISSION_WINDOW_MS) {
    const waitSeconds = Math.ceil((SUBMISSION_WINDOW_MS - (now - lastSubmission)) / 1000);
    return {
      allowed: false,
      message: `Wait ${waitSeconds} seconds before the next attempt.`
    };
  }

  recentSubmissions.set(key, now);
  return { allowed: true };
};

export const clearExpiredSubmissions = () => {
  const cutoff = Date.now() - SUBMISSION_WINDOW_MS;
  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (timestamp < cutoff) {
      recentSubmissions.delete(key);
    }
  }
};
