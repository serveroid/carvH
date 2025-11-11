import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Quest = {
  id: string;
  title: string;
  category: string;
  difficulty: "Beginner" | "Advanced" | "Expert";
  description: string;
  instructions: string;
  evaluationCriteria: string[];
  keywords: string[];
  minAnswerLength: number;
  maxAnswerLength: number;
  previewLimit: number;
  recommendedTimeMinutes: number;
  sampleAnswer: string;
};

type RewardReceipt =
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

type SubmissionResponse = {
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

type HistoryResponse = {
  submissions: SubmissionResponse[];
};

type ChainStatus =
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

type WalletChallengeResponse = {
  wallet: string;
  carvId: string;
  agentId: string;
  alias?: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

type AuthVerifyResponse = {
  token: string;
  wallet: string;
  carvId: string;
  agentId: string;
  alias?: string;
  expiresAt: string;
};

type LeaderboardEntry = {
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

type IdentityRecord = {
  wallet: string;
  carvId: string;
  agentId: string;
  alias?: string;
  registeredAt: string;
  lastVerifiedAt: string;
  totalVerifications: number;
};

type CarvOAuthStatus = {
  enabled: boolean;
};

type CarvOAuthProfile = {
  carvId: string;
  agentId: string;
  alias?: string;
  wallet?: string;
};

type SolanaConnectResult = { publicKey?: { toBase58(): string } };

type SolanaProvider = {
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<SolanaConnectResult>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array | number[] }>;
  publicKey?: { toBase58(): string };
  isPhantom?: boolean;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

const API_BASE = "";

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
};

const shortenAddress = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;

const deriveAlias = (wallet: string) => `Agent ${wallet.slice(0, 4)}…${wallet.slice(-4)}`;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const encodeBase58 = (input: Uint8Array) => {
  if (input.length === 0) {
    return "";
  }

  const digits: number[] = [0];

  for (const byte of input) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      const value = digits[i] * 256 + carry;
      digits[i] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let zeros = 0;
  while (zeros < input.length && input[zeros] === 0) {
    zeros += 1;
  }

  const encoded: string[] = [];
  for (let i = 0; i < zeros; i += 1) {
    encoded.push(BASE58_ALPHABET[0]);
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    encoded.push(BASE58_ALPHABET[digits[i]]);
  }

  return encoded.join("");
};

function App() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [selectedQuestId, setSelectedQuestId] = useState<string>("");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memoCopied, setMemoCopied] = useState(false);

  const [history, setHistory] = useState<SubmissionResponse[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [isChainLoading, setIsChainLoading] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [carvId, setCarvId] = useState("carv_demo1234");
  const [agentId, setAgentId] = useState("agent_demo1234");
  const [alias, setAlias] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [providerAvailable, setProviderAvailable] = useState(false);
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [isCarvOAuthEnabled, setIsCarvOAuthEnabled] = useState(false);
  const [isCarvOAuthLoading, setIsCarvOAuthLoading] = useState(false);
  const [isCarvOAuthExchange, setIsCarvOAuthExchange] = useState(false);
  const [carvOAuthMessage, setCarvOAuthMessage] = useState<string | null>(null);
  const [carvOAuthError, setCarvOAuthError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<Quest[]>(`${API_BASE}/api/quests`)
      .then((data) => {
        setQuests(data);
        if (data.length > 0) {
          setSelectedQuestId(data[0].id);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load quests");
      });
  }, []);

  useEffect(() => {
    fetchJson<CarvOAuthStatus>(`${API_BASE}/api/auth/carv/status`)
      .then((status) => setIsCarvOAuthEnabled(Boolean(status.enabled)))
      .catch(() => setIsCarvOAuthEnabled(false));
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname !== "/oauth/callback") {
      return;
    }
    const errorParam = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const resetUrl = () => window.history.replaceState({}, document.title, "/");

    if (errorParam) {
      setCarvOAuthError(decodeURIComponent(errorParam));
      resetUrl();
      return;
    }
    if (!code || !state) {
      setCarvOAuthError("CARV response is missing code/state parameters.");
      resetUrl();
      return;
    }
    setIsCarvOAuthExchange(true);
    setCarvOAuthError(null);
    fetchJson<CarvOAuthProfile>(`${API_BASE}/api/auth/carv/callback`, {
      method: "POST",
      body: JSON.stringify({ code, state })
    })
      .then((profile) => {
        setCarvId(profile.carvId);
        setAgentId(profile.agentId);
        if (profile.alias) {
          setAlias(profile.alias);
        }
        if (profile.wallet) {
          setWalletAddress(profile.wallet);
        }
        setCarvOAuthMessage("CARV ID filled automatically");
      })
      .catch((err) => {
        setCarvOAuthError(err instanceof Error ? err.message : "Failed to fetch CARV profile");
      })
      .finally(() => {
        setIsCarvOAuthExchange(false);
        resetUrl();
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const provider = window.solana;
    setProviderAvailable(Boolean(provider));

    if (provider?.isPhantom) {
      provider
        .connect({ onlyIfTrusted: true })
        .then((response) => {
          const detected = response.publicKey?.toBase58() ?? provider.publicKey?.toBase58();
          if (detected) {
            setWalletAddress(detected);
            if (!alias) {
              setAlias(deriveAlias(detected));
            }
          }
        })
        .catch(() => undefined);
    }
  }, [alias]);

  const loadChainStatus = useCallback(async () => {
    setIsChainLoading(true);
    setChainError(null);
    try {
      const status = await fetchJson<ChainStatus>(`${API_BASE}/api/chain/status`);
      setChainStatus(status);
    } catch (err) {
      setChainError(err instanceof Error ? err.message : "Failed to fetch RPC status");
    } finally {
      setIsChainLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChainStatus();
  }, [loadChainStatus]);

  const loadHistory = useCallback(
    async (targetWallet?: string) => {
      const trimmed = (targetWallet ?? walletAddress ?? "").trim();
      if (!trimmed) {
        setHistory([]);
        return;
      }
      setIsHistoryLoading(true);
      setHistoryError(null);
      try {
        const data = await fetchJson<HistoryResponse>(`${API_BASE}/api/history/${encodeURIComponent(trimmed)}`);
        setHistory(data.submissions ?? []);
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : "Failed to load history");
      } finally {
        setIsHistoryLoading(false);
      }
    },
    [walletAddress]
  );

  const loadLeaderboard = useCallback(async () => {
    setIsLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const data = await fetchJson<{ leaderboard: LeaderboardEntry[] }>(`${API_BASE}/api/leaderboard`);
      setLeaderboard(data.leaderboard ?? []);
    } catch (err) {
      setLeaderboardError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setIsLeaderboardLoading(false);
    }
  }, []);

  const loadIdentity = useCallback(async (targetWallet: string) => {
    if (!targetWallet) {
      setIdentity(null);
      return;
    }
    try {
      const record = await fetchJson<IdentityRecord>(`${API_BASE}/api/identity/${encodeURIComponent(targetWallet)}`);
      setIdentity(record);
      if (!alias) {
        setAlias(record.alias ?? deriveAlias(record.wallet));
      }
      setCarvId(record.carvId);
      setAgentId(record.agentId);
    } catch (err) {
      setIdentity(null);
      if (err instanceof Error && !err.message.includes("not found")) {
        setAuthError(err.message);
      }
    }
  }, [alias]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    if (!result) {
      return;
    }
    const timeout = setTimeout(() => setMemoCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [result]);

  useEffect(() => {
    if (walletAddress && sessionToken) {
      loadHistory(walletAddress);
      loadIdentity(walletAddress);
    }
  }, [walletAddress, sessionToken, loadHistory, loadIdentity]);

  const selectedQuest = useMemo(
    () => quests.find((quest) => quest.id === selectedQuestId),
    [quests, selectedQuestId]
  );

  const handleConnectWallet = async () => {
    setAuthError(null);
    if (!window.solana) {
      setAuthError("Install Phantom, Backpack, or another Solana wallet.");
      return;
    }
    try {
      const response = await window.solana.connect();
      const detected = response.publicKey?.toBase58() ?? window.solana.publicKey?.toBase58();
      if (!detected) {
        throw new Error("Failed to detect wallet address.");
      }
      setWalletAddress(detected);
      if (!alias) {
        setAlias(deriveAlias(detected));
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to connect wallet");
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await window.solana?.disconnect?.();
    } catch {
      // ignore disconnect errors
    }
    setWalletAddress(null);
    setSessionToken(null);
    setSessionExpiresAt(null);
    setIdentity(null);
    setHistory([]);
  };

  const handleCarvOAuth = async () => {
    setAuthError(null);
    setCarvOAuthError(null);
    setCarvOAuthMessage(null);
    setIsCarvOAuthLoading(true);
    try {
      const response = await fetchJson<{ url: string }>(`${API_BASE}/api/auth/carv/url`);
      window.location.href = response.url;
    } catch (err) {
      setCarvOAuthError(err instanceof Error ? err.message : "Failed to open CARV OAuth");
    } finally {
      setIsCarvOAuthLoading(false);
    }
  };

  const authenticateWallet = async () => {
    if (!walletAddress) {
      setAuthError("Connect your wallet first.");
      return;
    }
    if (!window.solana?.signMessage) {
      setAuthError("This wallet does not support message signing.");
      return;
    }

    const trimmedCarv = carvId.trim();
    const trimmedAgent = agentId.trim();
    const trimmedAlias = alias.trim();

    if (!trimmedCarv || !trimmedCarv.startsWith("carv_")) {
      setAuthError("Enter a valid CARV ID (format carv_xxx).");
      return;
    }
    if (!trimmedAgent || !trimmedAgent.startsWith("agent_")) {
      setAuthError("Enter a valid Agent ID (format agent_xxx).");
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const challenge = await fetchJson<WalletChallengeResponse>(`${API_BASE}/api/auth/challenge`, {
        method: "POST",
        body: JSON.stringify({
          walletAddress,
          carvId: trimmedCarv,
          agentId: trimmedAgent,
          alias: trimmedAlias
        })
      });

      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(challenge.message);
      const signatureResult = await window.solana.signMessage(messageBytes, "utf8");
      const signatureBytes = signatureResult.signature instanceof Uint8Array ? signatureResult.signature : Uint8Array.from(signatureResult.signature);
      const signature = encodeBase58(signatureBytes);

      const verification = await fetchJson<AuthVerifyResponse>(`${API_BASE}/api/auth/verify`, {
        method: "POST",
        body: JSON.stringify({
          walletAddress,
          carvId: trimmedCarv,
          agentId: trimmedAgent,
          signature,
          nonce: challenge.nonce
        })
      });

      setSessionToken(verification.token);
      setSessionExpiresAt(verification.expiresAt);
      setWalletAddress(verification.wallet);
      setCarvId(verification.carvId);
      setAgentId(verification.agentId);
      setAlias(verification.alias ?? (trimmedAlias || deriveAlias(verification.wallet)));
      setAuthError(null);
      loadHistory(verification.wallet);
      loadLeaderboard();
      loadIdentity(verification.wallet);
      loadChainStatus();
    } catch (err) {
      setSessionToken(null);
      setSessionExpiresAt(null);
      setAuthError(err instanceof Error ? err.message : "Failed to complete authentication");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedQuest) {
      setError("Select a quest");
      return;
    }
    if (!sessionToken || !walletAddress) {
      setError("Sign in with your wallet to submit solutions.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetchJson<SubmissionResponse>(`${API_BASE}/api/submissions`, {
        method: "POST",
        body: JSON.stringify({
          questId: selectedQuest.id,
          sessionToken,
          displayName: alias.trim() || undefined,
          answer
        })
      });

      setResult(response);
      setAnswer("");
      loadHistory(response.wallet);
      loadLeaderboard();
      loadChainStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown submission error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyMemo = () => {
    if (!result?.memoText) {
      return;
    }
    navigator.clipboard
      .writeText(result.memoText)
      .then(() => setMemoCopied(true))
      .catch(() => setMemoCopied(false));
  };

  const formatDate = (value: string) => {
    try {
      return new Date(value).toLocaleString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short"
      });
    } catch (error) {
      return value;
    }
  };

  const formatSol = (value: number) => `${value.toFixed(4)} SOL`;

  const pendingAuth = !sessionToken;

  return (
    <div className="app">
      <header className="card">
        <h1>AgentQuest</h1>
        <p>
          Solve AI-style quests and anchor proof-of-skill on CARV SVM via Memo. Wallet sign-in, SPL on-chain rewards, and
          a live leaderboard are already built in.
        </p>
        <div className="chain-status">
          <div>
            <strong>RPC status:</strong>{" "}
            {isChainLoading && <span>checking…</span>}
            {!isChainLoading && chainError && <span className="error">{chainError}</span>}
            {!isChainLoading && !chainError && chainStatus && (
              <span>{chainStatus.enabled ? "online" : `offline (${chainStatus.message})`}</span>
            )}
          </div>
          <button type="button" onClick={loadChainStatus} disabled={isChainLoading}>
            Refresh RPC
          </button>
        </div>
        {chainStatus?.enabled && (
          <div className="chain-grid">
            <div>
              <span className="chain-label">RPC</span>
              <span className="chain-value">{chainStatus.rpcEndpoint}</span>
            </div>
            <div>
              <span className="chain-label">Server wallet</span>
              <span className="chain-value">{chainStatus.wallet}</span>
            </div>
            <div>
              <span className="chain-label">Balance</span>
              <span className="chain-value">{formatSol(chainStatus.balanceSol)}</span>
            </div>
            <div>
              <span className="chain-label">Blockhash</span>
              <span className="chain-value">{chainStatus.latestBlockhash}</span>
            </div>
            {chainStatus.rewardMint && (
              <div>
                <span className="chain-label">Reward reserve</span>
                <span className="chain-value">
                  {chainStatus.rewardBalanceDisplay ?? "—"} ({shortenAddress(chainStatus.rewardMint)})
                </span>
              </div>
            )}
          </div>
        )}
      </header>

      <section className="card">
        <h2>Authorization & identity</h2>
        <div className="auth-grid">
          <div className="auth-row">
            <label>Wallet</label>
            <div className="wallet-row">
              <span>{walletAddress ? shortenAddress(walletAddress) : "not connected"}</span>
              {walletAddress ? (
                <button type="button" onClick={handleDisconnectWallet}>
                  Disconnect
                </button>
              ) : (
                <button type="button" onClick={handleConnectWallet} disabled={!providerAvailable}>
                  Connect
                </button>
              )}
            </div>
            {!providerAvailable && (
              <small>Install Phantom, Backpack, or any Solana wallet with Sign Message support to continue.</small>
            )}
          </div>
          {isCarvOAuthEnabled && (
            <div className="auth-row">
              <label>CARV OAuth</label>
              <div className="wallet-row">
                <span>{carvOAuthMessage ?? "Fetch CARV ID automatically"}</span>
                <button type="button" onClick={handleCarvOAuth} disabled={isCarvOAuthLoading || isCarvOAuthExchange}>
                  {isCarvOAuthLoading ? "Opening CARV…" : "Sign in with CARV ID"}
                </button>
              </div>
              {isCarvOAuthExchange && <small>Completing CARV authorization…</small>}
            </div>
          )}
          <div>
            <label htmlFor="carvId">CARV ID</label>
            <input
              id="carvId"
              type="text"
              placeholder="carv_agentquest"
              value={carvId}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setCarvId(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="agentId">Agent ID</label>
            <input
              id="agentId"
              type="text"
              placeholder="agent_alpha"
              value={agentId}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setAgentId(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="alias">Leaderboard alias</label>
            <input
              id="alias"
              type="text"
              placeholder="Agent Neo"
              value={alias}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setAlias(event.target.value)}
              maxLength={40}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={authenticateWallet} disabled={!walletAddress || isAuthenticating}>
            {isAuthenticating ? "Signing…" : sessionToken ? "Refresh signature" : "Sign challenge"}
          </button>
          {sessionExpiresAt && (
            <span>
              Session valid until {formatDate(sessionExpiresAt)} ({shortenAddress(walletAddress ?? "")})
            </span>
          )}
        </div>
        {authError && <p className="error">{authError}</p>}
        {carvOAuthError && <p className="error">{carvOAuthError}</p>}
        {identity && (
          <div className="identity-card">
            <div>
              <strong>CARV ID:</strong> {identity.carvId}
            </div>
            <div>
              <strong>Agent ID:</strong> {identity.agentId}
            </div>
            <div>
              <strong>Alias:</strong> {identity.alias ?? "—"}
            </div>
            <div>
              <strong>Verifications:</strong> {identity.totalVerifications}
            </div>
            <div>
              <strong>Last signature:</strong> {formatDate(identity.lastVerifiedAt)}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Choose a quest</h2>
        {quests.length === 0 && !error && <p>Loading quests…</p>}
        {error && <p className="error">{error}</p>}
        <div className="quests-list">
          {quests.map((quest) => (
            <label
              key={quest.id}
              className={`quest-option ${quest.id === selectedQuestId ? "selected" : ""}`}
              htmlFor={`quest-${quest.id}`}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                <h3>{quest.title}</h3>
                <input
                  type="radio"
                  id={`quest-${quest.id}`}
                  name="quest"
                  value={quest.id}
                  checked={quest.id === selectedQuestId}
                  onChange={() => setSelectedQuestId(quest.id)}
                  style={{ marginTop: 4 }}
                />
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "0.85rem", color: "#475569" }}>
                <span>{quest.category}</span>
                <span>·</span>
                <span>{quest.difficulty}</span>
                <span>·</span>
                <span>{quest.recommendedTimeMinutes} min</span>
              </div>
              <p style={{ marginBottom: 0 }}>{quest.description}</p>
              <p>{quest.instructions}</p>
              <div className="pill">
                {quest.keywords.map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
              </div>
              <ul style={{ margin: "0 0 8px 0", paddingLeft: "18px", fontSize: "0.85rem", color: "#475569" }}>
                {quest.evaluationCriteria.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <small>
                Allowed answer length: {quest.minAnswerLength}—{quest.maxAnswerLength} characters
              </small>
              <details style={{ marginTop: 8 }}>
                <summary>Sample answer</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.4 }}>{quest.sampleAnswer}</pre>
              </details>
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Submit your solution</h2>
        {pendingAuth && <p className="error">Connect your wallet and sign the challenge before submitting.</p>}
        <form onSubmit={handleSubmit}>
          <div>
            <label>Display name</label>
            <input type="text" value={alias} onChange={(event) => setAlias(event.target.value)} disabled={pendingAuth} />
          </div>
          <div>
            <label htmlFor="answer">Answer</label>
            <textarea
              id="answer"
              placeholder="Paste your answer…"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              required
              minLength={selectedQuest?.minAnswerLength ?? 10}
              maxLength={selectedQuest?.maxAnswerLength ?? 4000}
              disabled={pendingAuth}
            />
          </div>
          <button type="submit" disabled={isSubmitting || pendingAuth}>
            {isSubmitting ? "Checking…" : "Submit and write memo"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      {result && (
        <section className="card success">
          <h2>Result</h2>
          <div className="result-grid">
            <div className="result-item">
              <strong>Quest</strong>
              <span>{result.questTitle}</span>
            </div>
            <div className="result-item">
              <strong>Time</strong>
              <span>{formatDate(result.timestamp)}</span>
            </div>
            <div className="result-item">
              <strong>Score</strong>
              <span>{result.score} / 100</span>
            </div>
            <div className="result-item">
              <strong>Reasoning</strong>
              <span>{result.reasoning}</span>
            </div>
            <div className="result-item">
              <strong>Wallet</strong>
              <span>{shortenAddress(result.wallet)}</span>
            </div>
            <div className="result-item">
              <strong>CARV ID</strong>
              <span>{result.carvId}</span>
            </div>
            <div className="result-item">
              <strong>Agent ID</strong>
              <span>{result.agentId}</span>
            </div>
            <div className="result-item">
              <strong>Proof hash</strong>
              <span style={{ wordBreak: "break-all" }}>{result.proofHash}</span>
            </div>
            <div className="result-item">
              <strong>On-chain status</strong>
              <span>
                {result.onChainStatus === "submitted" && "Transaction submitted"}
                {result.onChainStatus === "skipped" && "Submission skipped"}
                {result.onChainStatus === "failed" && "Submission failed"}
              </span>
              {result.onChainMessage && <small>{result.onChainMessage}</small>}
              {result.onChainStatus === "submitted" && (
                <small>{result.onChainVerified ? "Memo verified via RPC" : "Unable to verify memo"}</small>
              )}
            </div>
            {result.reward && (
              <div className="result-item">
                <strong>Reward</strong>
                {result.reward.status === "minted" && (
                  <span>
                    +{result.reward.amountDisplay} ({shortenAddress(result.reward.mint)})
                    <br />
                    <small>Transaction: {shortenAddress(result.reward.signature)}</small>
                  </span>
                )}
                {result.reward.status !== "minted" && (
                  <span>
                    {result.reward.status === "skipped" ? "Skipped" : "Error"}
                    <br />
                    <small>{result.reward.reason}</small>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="result-item" style={{ width: "100%" }}>
            <strong>Answer preview</strong>
            <span>{result.answerPreview}</span>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            {result.transactionSignature && result.explorerUrl && (
              <a href={result.explorerUrl} target="_blank" rel="noreferrer">
                View transaction →
              </a>
            )}
            {result.reward?.status === "minted" && result.reward.explorerUrl && (
              <a href={result.reward.explorerUrl} target="_blank" rel="noreferrer">
                Reward signature →
              </a>
            )}
            {result.memoText && (
              <button type="button" onClick={handleCopyMemo} disabled={memoCopied}>
                {memoCopied ? "Copied!" : "Copy memo"}
              </button>
            )}
            <span>LLM: {result.usedLLM ? "used" : "heuristics"}</span>
          </div>
        </section>
      )}

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Attempt history</h2>
          <button
            type="button"
            onClick={() => walletAddress && loadHistory(walletAddress)}
            disabled={!walletAddress || isHistoryLoading}
          >
            {isHistoryLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {!walletAddress && <p>Connect your wallet and sign in to view history.</p>}
        {walletAddress && historyError && <p className="error">{historyError}</p>}
        {walletAddress && !historyError && history.length === 0 && !isHistoryLoading && (
          <p>No attempts yet — solve your first quest!</p>
        )}
        {walletAddress && !historyError && history.length > 0 && (
          <ul className="history-list">
            {history.map((entry, index) => (
              <li key={`${entry.proofHash}-${index}`} className="history-item">
                <div className="history-header">
                  <span className="history-title">{entry.questTitle}</span>
                  <span className="history-time">{formatDate(entry.timestamp)}</span>
                </div>
                <div className="history-meta">
                  <span>Score: {entry.score}</span>
                  <span>LLM: {entry.usedLLM ? "yes" : "no"}</span>
                  <span>On-chain: {entry.onChainStatus}</span>
                  {entry.reward && (
                    <span>
                      Reward:{" "}
                      {entry.reward.status === "minted"
                        ? `+${entry.reward.amountDisplay}`
                        : entry.reward.status === "skipped"
                          ? "skipped"
                          : "error"}
                    </span>
                  )}
                </div>
                <div className="history-preview">{entry.answerPreview}</div>
                <div className="history-links">
                  <span className="history-hash">{entry.proofHash}</span>
                  {entry.explorerUrl && (
                    <a href={entry.explorerUrl} target="_blank" rel="noreferrer">
                      Transaction
                    </a>
                  )}
                  {entry.reward?.status === "minted" && entry.reward.signature && (
                    <a href={entry.reward.explorerUrl} target="_blank" rel="noreferrer">
                      Reward
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>On-chain rewards leaderboard</h2>
          <button type="button" onClick={loadLeaderboard} disabled={isLeaderboardLoading}>
            {isLeaderboardLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {leaderboardError && <p className="error">{leaderboardError}</p>}
        {!leaderboardError && leaderboard.length === 0 && !isLeaderboardLoading && (
          <p>No entries yet — be the first to earn an on-chain reward.</p>
        )}
        {!leaderboardError && leaderboard.length > 0 && (
          <div className="leaderboard">
            <div className="leaderboard-header">
              <span>#</span>
              <span>Alias / Wallet</span>
              <span>CARV / Agent</span>
              <span>Points</span>
              <span>Rewards</span>
              <span>Attempts</span>
              <span>Last submission</span>
            </div>
            {leaderboard.map((entry, index) => (
              <div key={entry.wallet} className="leaderboard-row">
                <span>{index + 1}</span>
                <span>
                  {entry.displayName} <br />
                  <small>{shortenAddress(entry.wallet)}</small>
                </span>
                <span>
                  {entry.carvId}
                  <br />
                  <small>{entry.agentId}</small>
                </span>
                <span>
                  {entry.totalScore} (avg {entry.averageScore})
                  <br />
                  <small>best {entry.bestScore}</small>
                </span>
                <span>
                  {entry.totalRewardsDisplay}
                  <br />
                  <small>{entry.mintedRewards} rewards</small>
                </span>
                <span>{entry.attempts}</span>
                <span>{formatDate(entry.lastSubmission)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="footer">
        AgentQuest · CARV SVM Demo · {new Date().getFullYear()} · Rewards and memos without smart contracts
      </footer>
    </div>
  );
}

export default App;
