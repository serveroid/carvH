"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearExpiredSubmissions = exports.checkUserQuestRateLimit = exports.ipRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const SUBMISSION_WINDOW_MS = 60000; // 1 minute between attempts per quest/user
const recentSubmissions = new Map();
exports.ipRateLimiter = (0, express_rate_limit_1.default)({
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
const checkUserQuestRateLimit = (questId, userId) => {
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
exports.checkUserQuestRateLimit = checkUserQuestRateLimit;
const clearExpiredSubmissions = () => {
    const cutoff = Date.now() - SUBMISSION_WINDOW_MS;
    for (const [key, timestamp] of recentSubmissions.entries()) {
        if (timestamp < cutoff) {
            recentSubmissions.delete(key);
        }
    }
};
exports.clearExpiredSubmissions = clearExpiredSubmissions;
//# sourceMappingURL=rateLimiter.js.map