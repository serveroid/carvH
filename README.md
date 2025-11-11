# AgentQuest MVP

AgentQuest is a demo service for CARV hackathons. Users solve small AI-themed quests, the backend evaluates every answer, and a proof hash is written to CARV SVM via the Memo program. The stack consists of a TypeScript Express API and a Vite + React SPA.

## Project structure

- `backend/` – quest catalogue, scoring logic, wallet auth, Memo + reward submission, leaderboard.
- `frontend/` – SPA for picking quests, submitting answers, viewing history, OAuth, and chain status.

## Quick start

1. Install dependencies
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
2. Configure environment
   - Copy `backend/.env.example` to `backend/.env`.
   - Fill in secrets (see table below).
3. Run backend
   ```bash
   cd backend
   npm run dev
   ```
4. Run frontend in another terminal
   ```bash
   cd frontend
   npm run dev
   ```
5. Open <http://localhost:5173>.
6. (Optional) Run backend tests
   ```bash
   cd backend
   npm run test
   ```

## Environment variables (`backend/.env`)

| Variable | Description |
| --- | --- |
| `RPC_ENDPOINT` | CARV SVM/Solana RPC endpoint. Required for Memo submission. |
| `SERVER_SECRET_KEY` | Server keypair (Base58 or JSON array from `solana-keygen`). |
| `OPENAI_API_KEY` | Optional. Enables LLM-based scoring. |
| `EXPLORER_BASE_URL` | Explorer base URL (default Solana explorer). |
| `PORT` | API port (default `4000`). |
| `HISTORY_STORAGE_PATH` | JSON file for submission history (e.g. `./storage/history.json`). |
| `IDENTITY_STORAGE_PATH` | JSON file for wallet ↔ CARV/Agent registry (e.g. `./storage/identities.json`). |
| `REWARD_TOKEN_MINT` | SPL mint for rewards. Leave empty to disable rewards. |
| `REWARD_TOKEN_DECIMALS` | Decimal places for the SPL mint (default `9`). |
| `REWARD_TOKENS_PER_SCORE` | Reward multiplier per score point (default `0.1`). |
| `REWARD_MIN_SCORE` | Minimum score to mint rewards (default `75`). |
| `SESSION_TTL_MINUTES` | Wallet session lifetime (default `360`). |
| `CHALLENGE_TTL_MINUTES` | Wallet challenge lifetime (default `10`). |
| `CARV_OAUTH_CLIENT_ID` | Optional CARV OAuth client ID. |
| `CARV_OAUTH_CLIENT_SECRET` | CARV OAuth client secret. |
| `CARV_OAUTH_AUTHORIZE_URL` | OAuth authorize URL (e.g. `https://auth.carv.io/auth/authorize`). |
| `CARV_OAUTH_TOKEN_URL` | Token endpoint (e.g. `https://oauth.carv.io/oauth2/token`). |
| `CARV_OAUTH_PROFILE_URL` | Profile endpoint returning CARV/Agent IDs. |
| `CARV_OAUTH_REDIRECT_URI` | Redirect URI (e.g. `https://your-domain.com/oauth/callback`). |
| `CARV_OAUTH_SCOPES` | Requested scopes (default `basic`). |

## Backend API

- `GET /api/quests` – quest catalogue: categories, sample answers, limits.
- `GET /api/history/:wallet` – last 10 submissions for the wallet.
- `GET /api/chain/status` – RPC health, server wallet, optional reward reserve.
- `GET /api/leaderboard` – aggregated scores/rewards for the leaderboard block.
- `GET /api/identity/:wallet` – CARV/Agent ID bound to the wallet (404 if none).
- `GET /api/identities` – full registry dump (for admin tooling).
- `POST /api/auth/challenge` – issues a wallet-sign challenge (Phantom/Backpack Sign Message).
- `POST /api/auth/verify` – verifies signature, creates a session token.
- `POST /api/auth/logout` – invalidates a session.
- `GET /api/auth/carv/status` – feature flag for CARV OAuth.
- `GET /api/auth/carv/url` – returns `{url,state}` for CARV OAuth redirect.
- `POST /api/auth/carv/callback` – exchanges `code/state` for CARV profile (carvId/agentId/alias/wallet).
- `POST /api/submissions` – main endpoint: validates payload, evaluates answer, writes Memo, distributes rewards, persists history.

### Processing flow

1. Client submits `{ questId, sessionToken, displayName?, answer }`.
2. Backend validates the payload, ensures rate limits and quest-specific length limits.
3. `evaluateAnswer` uses OpenAI (if configured) or heuristics to produce `{ score, reasoning, usedLLM }`.
4. Server builds a proof payload, hashes it, and sends `AgentQuest:<hash>` through Memo. Response includes signature/explorer link if on-chain was successful.
5. Reward service optionally mints SPL tokens when score ≥ threshold and the server ATA has enough balance.
6. Submission history is stored locally for `/api/history` and powers the leaderboard.

## Frontend highlights

- Wallet block shows connection status, CARV OAuth button, CARV/Agent IDs, and session expiration.
- Quests include descriptions, instructions, keywords, evaluation criteria, and sample answers.
- Submission form enforces quest-specific min/max length and warns when the user is not authenticated.
- Result card exposes score, reasoning, proof hash, memo status, reward transaction, answer preview, copy memo button, and LLM usage indicator.
- History lists recent submissions with timestamps, LLM usage, on-chain status, and explorer links.
- Leaderboard ranks users by total score (tie-breakers: minted rewards, recency).
- Chain status card lists RPC endpoint, server wallet, SOL balance, latest blockhash, and optional reward reserve.

## Manual test plan

1. **Empty fields** – try submitting without wallet/session/answer. Expect validation errors.
2. **Long answer** – exceed `maxAnswerLength` to ensure the server rejects it.
3. **LLM fallback** – remove `OPENAI_API_KEY` and verify heuristic scoring plus memo still succeed.
4. **Broken RPC** – set invalid `RPC_ENDPOINT`; chain status should show `enabled: false` and submissions should report skipped/failed Memo.
5. **Rate limit** – submit twice for the same quest within 60 seconds; expect the friendly rate-limit message.
6. **Different quests/users** – confirm proof hashes differ per payload.
7. **Explorer links** – click memo/reward links and ensure the explorer opens the right transaction.

## Wallet auth, CARV ID, Agent ID

- `/api/auth/challenge` issues a Sign Message payload tying wallet + CARV ID + Agent ID (server ensures uniqueness).
- `/api/auth/verify` validates signature, binds identity, and creates a session token stored server-side.
- `/api/auth/carv/url` + `/api/auth/carv/callback` add OAuth 2.0 login. Once configured, the SPA button “Sign in with CARV ID” fills CARV/Agent IDs (and alias) automatically.
- Identity registry is persisted at `IDENTITY_STORAGE_PATH` (JSON). Copy the file when migrating servers.

## On-chain rewards & leaderboard

- Rewards are minted via SPL Token ATA transfer. Server checks balance before attempts and creates the user ATA if missing.
- Display amount is formatted via `formatDisplayAmount`; raw amounts are returned for analytics.
- Leaderboard aggregates total/average/best score, attempts, minted rewards, last proof hash, and reward signature.
- Chain status card surfaces the reward mint address and balances so operators can monitor liquidity.

## Deployment guide

### 1. Prerequisites

- Ubuntu server with Node.js 20+, npm 10+, git, build-essential.
- Reverse proxy (Nginx) and a domain pointing to the server (HTTPS is required for Phantom/Backpack).
- Solana CLI for generating the server keypair and checking balances.
- Optional: PM2 or systemd for long-running services.

### 2. Wallet & RPC setup

1. Generate a server keypair
   ```bash
   solana-keygen new -o /etc/agentquest/server-keypair.json
   ```
2. Fund the wallet with SOL (fees) and, if rewards are enabled, mint tokens and create the ATA: `spl-token create-account <MINT>`.
3. Choose an RPC endpoint (CARV testnet, Solana devnet/mainnet, etc.) verified to support `sendTransaction`.

### 3. Environment file

Create `/etc/agentquest/.env`:

```bash
PORT=4000
RPC_ENDPOINT=https://api.devnet.solana.com
SERVER_SECRET_KEY=[...]  # JSON array or Base58
EXPLORER_BASE_URL=https://explorer.solana.com/tx/?cluster=devnet
OPENAI_API_KEY=
HISTORY_STORAGE_PATH=/opt/agentquest/storage/history.json
IDENTITY_STORAGE_PATH=/opt/agentquest/storage/identities.json
REWARD_TOKEN_MINT=
REWARD_TOKEN_DECIMALS=9
REWARD_TOKENS_PER_SCORE=0.1
REWARD_MIN_SCORE=75
SESSION_TTL_MINUTES=360
CHALLENGE_TTL_MINUTES=10
CARV_OAUTH_CLIENT_ID=
CARV_OAUTH_CLIENT_SECRET=
CARV_OAUTH_AUTHORIZE_URL=https://auth.carv.io/auth/authorize
CARV_OAUTH_TOKEN_URL=https://oauth.carv.io/oauth2/token
CARV_OAUTH_PROFILE_URL=https://oauth.carv.io/api/userinfo
CARV_OAUTH_REDIRECT_URI=https://your-domain.com/oauth/callback
CARV_OAUTH_SCOPES=carv_id_basic_read solana_address_basic_read
```

Restrict permissions: `chmod 600 /etc/agentquest/.env /etc/agentquest/server-keypair.json`.

### 4. Backend deployment

```bash
sudo useradd -r -s /usr/sbin/nologin agentquest
sudo mkdir -p /opt/agentquest/storage
sudo chown -R agentquest:agentquest /opt/agentquest
cd /opt/agentquest
sudo -u agentquest git clone <your-fork> .
cd backend
sudo -u agentquest npm install
sudo -u agentquest npm run build
```

Systemd unit (`/etc/systemd/system/agentquest.service`):

```
[Unit]
Description=AgentQuest API
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/agentquest/.env
WorkingDirectory=/opt/agentquest/backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
User=agentquest
Group=agentquest

[Install]
WantedBy=multi-user.target
```

Enable + start: `sudo systemctl enable --now agentquest`.

### 5. Frontend deployment

```bash
cd /opt/agentquest/frontend
sudo -u agentquest npm install
sudo -u agentquest npm run build
```

Serve `frontend/dist` via Nginx (or any static host). Example `/etc/nginx/sites-available/agentquest.conf`:

```
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /opt/agentquest/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /assets/ {
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Run `sudo nginx -t && sudo systemctl reload nginx`. Use Certbot for HTTPS if you do not already have certificates.

### 6. Smoke test

1. `curl http://127.0.0.1:4000/health` → `{"status":"ok","onChain":true}`.
2. Visit the SPA over HTTPS, connect Phantom/Backpack, sign the challenge.
3. Submit a quest answer, confirm Memo transaction + (optionally) reward transaction in the explorer.
4. Check `storage/history.json` and `storage/identities.json` are being updated.

### 7. Maintenance

- Back up `/opt/agentquest/storage` and `/etc/agentquest` regularly.
- Monitor SOL + reward token balances (`/api/chain/status`).
- Rotate CARV OAuth credentials or RPC keys as needed.
- Pull new commits, rebuild backend/frontend, and restart the service when upgrading.

