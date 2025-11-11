"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppConfig = void 0;
const dotenv_1 = require("dotenv");
const zod_1 = require("zod");
(0, dotenv_1.config)();
const EnvSchema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(4000),
    RPC_ENDPOINT: zod_1.z.string().optional(),
    SERVER_SECRET_KEY: zod_1.z.string().optional(),
    OPENAI_API_KEY: zod_1.z.string().optional(),
    EXPLORER_BASE_URL: zod_1.z
        .string()
        .url()
        .default("https://explorer.solana.com/tx/"),
    HISTORY_STORAGE_PATH: zod_1.z.string().optional(),
    IDENTITY_STORAGE_PATH: zod_1.z.string().optional(),
    REWARD_TOKEN_MINT: zod_1.z.string().optional(),
    REWARD_TOKEN_DECIMALS: zod_1.z.coerce.number().min(0).max(12).default(9),
    REWARD_TOKENS_PER_SCORE: zod_1.z.coerce.number().nonnegative().default(0.1),
    REWARD_MIN_SCORE: zod_1.z.coerce.number().min(0).max(100).default(75),
    SESSION_TTL_MINUTES: zod_1.z.coerce.number().min(5).max(24 * 60).default(6 * 60),
    CHALLENGE_TTL_MINUTES: zod_1.z.coerce.number().min(1).max(60).default(10),
    CARV_OAUTH_CLIENT_ID: zod_1.z.string().optional(),
    CARV_OAUTH_CLIENT_SECRET: zod_1.z.string().optional(),
    CARV_OAUTH_AUTHORIZE_URL: zod_1.z.string().url().optional(),
    CARV_OAUTH_TOKEN_URL: zod_1.z.string().url().optional(),
    CARV_OAUTH_PROFILE_URL: zod_1.z.string().url().optional(),
    CARV_OAUTH_REDIRECT_URI: zod_1.z.string().url().optional(),
    CARV_OAUTH_SCOPES: zod_1.z.string().default("basic")
});
const parsed = EnvSchema.safeParse({
    PORT: process.env.PORT,
    RPC_ENDPOINT: process.env.RPC_ENDPOINT,
    SERVER_SECRET_KEY: process.env.SERVER_SECRET_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    EXPLORER_BASE_URL: process.env.EXPLORER_BASE_URL,
    HISTORY_STORAGE_PATH: process.env.HISTORY_STORAGE_PATH,
    IDENTITY_STORAGE_PATH: process.env.IDENTITY_STORAGE_PATH,
    REWARD_TOKEN_MINT: process.env.REWARD_TOKEN_MINT,
    REWARD_TOKEN_DECIMALS: process.env.REWARD_TOKEN_DECIMALS,
    REWARD_TOKENS_PER_SCORE: process.env.REWARD_TOKENS_PER_SCORE,
    REWARD_MIN_SCORE: process.env.REWARD_MIN_SCORE,
    SESSION_TTL_MINUTES: process.env.SESSION_TTL_MINUTES,
    CHALLENGE_TTL_MINUTES: process.env.CHALLENGE_TTL_MINUTES,
    CARV_OAUTH_CLIENT_ID: process.env.CARV_OAUTH_CLIENT_ID,
    CARV_OAUTH_CLIENT_SECRET: process.env.CARV_OAUTH_CLIENT_SECRET,
    CARV_OAUTH_AUTHORIZE_URL: process.env.CARV_OAUTH_AUTHORIZE_URL,
    CARV_OAUTH_TOKEN_URL: process.env.CARV_OAUTH_TOKEN_URL,
    CARV_OAUTH_PROFILE_URL: process.env.CARV_OAUTH_PROFILE_URL,
    CARV_OAUTH_REDIRECT_URI: process.env.CARV_OAUTH_REDIRECT_URI,
    CARV_OAUTH_SCOPES: process.env.CARV_OAUTH_SCOPES
});
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
    throw new Error("Failed to parse environment configuration");
}
const env = parsed.data;
exports.AppConfig = {
    port: env.PORT,
    rpcEndpoint: env.RPC_ENDPOINT,
    serverSecretKey: env.SERVER_SECRET_KEY,
    openAIApiKey: env.OPENAI_API_KEY,
    explorerBaseUrl: env.EXPLORER_BASE_URL,
    historyStoragePath: env.HISTORY_STORAGE_PATH,
    identityStoragePath: env.IDENTITY_STORAGE_PATH,
    rewardTokenMint: env.REWARD_TOKEN_MINT,
    rewardTokenDecimals: env.REWARD_TOKEN_DECIMALS,
    rewardTokensPerScore: env.REWARD_TOKENS_PER_SCORE,
    rewardMinScore: env.REWARD_MIN_SCORE,
    sessionTtlMinutes: env.SESSION_TTL_MINUTES,
    challengeTtlMinutes: env.CHALLENGE_TTL_MINUTES,
    isOnChainEnabled: Boolean(env.RPC_ENDPOINT && env.SERVER_SECRET_KEY),
    isRewardEnabled: Boolean(env.RPC_ENDPOINT && env.SERVER_SECRET_KEY && env.REWARD_TOKEN_MINT),
    carvOAuth: {
        clientId: env.CARV_OAUTH_CLIENT_ID,
        clientSecret: env.CARV_OAUTH_CLIENT_SECRET,
        authorizeUrl: env.CARV_OAUTH_AUTHORIZE_URL,
        tokenUrl: env.CARV_OAUTH_TOKEN_URL,
        profileUrl: env.CARV_OAUTH_PROFILE_URL,
        redirectUri: env.CARV_OAUTH_REDIRECT_URI,
        scopes: env.CARV_OAUTH_SCOPES,
        enabled: Boolean(env.CARV_OAUTH_CLIENT_ID &&
            env.CARV_OAUTH_CLIENT_SECRET &&
            env.CARV_OAUTH_AUTHORIZE_URL &&
            env.CARV_OAUTH_TOKEN_URL &&
            env.CARV_OAUTH_PROFILE_URL &&
            env.CARV_OAUTH_REDIRECT_URI)
    }
};
//# sourceMappingURL=config.js.map