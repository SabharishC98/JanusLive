# PwnLab Live — LLM Jailbreak Tournament

**PwnLab Live** is a public, real-time LLM-jailbreak tournament running a live **Flagsmith Experimentation 2-Arm A/B trial** (`control` vs `lurien`) on prompt-injection defenses. When the tournament reaches sufficient power ($n \ge 75$ identities per arm), it evaluates candidate defenses through a statistical Bayesian gate, allows one-click human approval via the Flagsmith Management API, and enforces automated rollback if live breach rates exceed pre-registered thresholds.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │ Anonymous User (UUID Cookie Identity)  │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │    Next.js 14 API (/api/chat)          │
                      │  Flagsmith: getIdentityFlags(identity) │
                      │  (Returns 503 if Flagsmith unreachable)│
                      └──────────┬─────────────────┬───────────┘
                                 │                 │
                        50.0%    │                 │    50.0%
                   ┌─────────────┘                 └─────────────┐
                   ▼                                             ▼
 ┌────────────────────────────────────┐        ┌────────────────────────────────────┐
 │              control               │        │               lurien               │
 │ Plain system prompt with canary    │        │ External Lurien Matrix Firewall    │
 │ No input/output filtering          │        │ Pre & Post LLM scan layers         │
 └─────────────────┬──────────────────┘        └─────────────────┬──────────────────┘
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │  Gemini 2.5 Flash (Server-Side Only)   │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │ Deterministic Breach Detector (detect) │
                      │ Canary: VAULT-xxxx-xxxx (Normalized,   │
                      │ Leetspeak, Reverse, Base64, Split-Char)│
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │  libsql / Turso Audit & Telemetry Log  │
                      │  (Errors isolated; Re-rolls excluded)  │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │      Statistical Gate (/ship)          │
                      │ n >= 75 per arm (N >= 150 total)       │
                      │ P(win) >= 95% on breach rate           │
                      │ Benign non-inferiority (> -3pp)        │
                      │ P95 latency <= 5s, Cost <= $0.01/turn  │
                      └───────────────────┬────────────────────┘
                                          │
                         Human Approval   ▼   Flagsmith Management API
                      ┌────────────────────────────────────────┐
                      │  Rollout: 100% Winner / Auto-Rollback  │
                      └────────────────────────────────────────┘
```

---

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript strict)
- **Styling:** Tailwind CSS (Dark minimal responsive theme)
- **Experimentation Engine:** Flagsmith (`flagsmith-nodejs` + Ingestion API retry queue)
- **LLM Engine:** Google Gemini API (`@google/generative-ai`, server-side only)
- **Database:** `@libsql/client` (Local SQLite in dev, Turso in production)
- **Testing:** Vitest

---

## Prerequisites

- Node.js 18.18+ or 20+
- A [Flagsmith](https://flagsmith.com) account (Cloud or self-hosted)
- A Google AI Studio API key ([Gemini API](https://aistudio.google.com/))
- A running Lurien Matrix Firewall endpoint (`LURIEN_API_URL` + `LURIEN_API_KEY`)
- A Turso database for production (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`)

---

## 1. Flagsmith Experiment Setup (2 Arms: Option A)

To run the live 2-arm A/B test on Flagsmith:

### Step 1: Create the Feature Flag
1. Open your Flagsmith Project & Environment dashboard.
2. Click **Create Feature**.
3. Name the feature: `defense_variant`.
4. Enable **Multivariate**.
5. Set the default value to `control`.
6. Add one multivariate option:
   - **Option 1:** Value: `lurien`, Weight: `50.0%`.
   *(Flagsmith automatically allocates the remaining `50.0%` to the default value `control`).*
7. Note down the **Option ID** for `lurien` from the URL or feature details.

### Step 2: Retrieve Keys & IDs for `.env.local`
- **Server Environment Key:** Found under *Environment Settings > SDK Keys*. Starts with `ser.`
- **Client Environment Key:** Found under *Environment Settings > SDK Keys*.
- **Environment ID:** Numeric ID in *Environment Settings* URL.
- **Feature ID:** Numeric ID visible in the feature details or URL (`/features/<FEATURE_ID>`).
- **Management API Key:** Generated under *Your Account > Personal Access Tokens (PAT)*.

---

## 2. Environment Variables Setup

Copy `.env.example` to `.env.local` and configure:

```env
# Flagsmith
FLAGSMITH_ENVIRONMENT_KEY=ser.xxxxxx
FLAGSMITH_CLIENT_ENV_KEY=xxxxxx
NEXT_PUBLIC_FLAGSMITH_CLIENT_ENV_KEY=xxxxxx
FLAGSMITH_API_URL=https://edge.api.flagsmith.com/api/v1/
FLAGSMITH_MANAGEMENT_API_KEY=flagsmith_pat_xxxxxx
FLAGSMITH_ENVIRONMENT_ID=12345
FLAGSMITH_FEATURE_ID=67890
FLAGSMITH_LURIEN_MV_ID=22222

# Google Gemini API (Server-side only)
GEMINI_API_KEY=AIzaxxxxxxx

# Lurien Matrix Firewall
LURIEN_API_URL=https://your-lurien-endpoint/v1/check
LURIEN_API_KEY=fw_live_xxxxxx

# Database (Turso in production; local file in dev)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=xxxxxx
DATABASE_URL=file:./pwnlab.db
DEV_DATABASE_URL=file:./pwnlab-dev.db

# Admin & Security Controls (must be >= 12 chars and never 'changeme')
ADMIN_PASSWORD=your_secure_12plus_char_password
CRON_SECRET=your_secure_cron_secret_token
SHIP_APPROVAL_TTL_HOURS=24

# Experimentation Gate Settings (Option A: 2 arms)
EXPERIMENT_MIN_SAMPLE=75
EXPERIMENT_MAX_BREACH_RATE=0.15
EXPERIMENT_MAX_LATENCY_P95=5000
EXPERIMENT_MAX_COST_PER_TURN=0.01

# Pre-registration Commit Hash
PREREG_COMMIT=<git-commit-hash-of-hypothesis.md>

# Simulated DB Flag (set to false or unset in production)
SIMULATED_DB=false
```

After your first commit, run `git rev-parse HEAD` and set `PREREG_COMMIT=<hash>` in `.env.local`. The `/method` page will link to this commit as the pre-registration record.

### Environment Variable Reference

| Variable | Description |
|---|---|
| `FLAGSMITH_ENVIRONMENT_KEY` | Flagsmith Server-Side SDK key (`ser.*`) for evaluating identity flags and ingesting events. |
| `FLAGSMITH_MANAGEMENT_API_KEY` | Flagsmith Personal Access Token (PAT) used by `/api/ship` and `/api/cron` to update flag weights. |
| `FLAGSMITH_ENVIRONMENT_ID` | Numeric Flagsmith environment ID for Management API calls. |
| `FLAGSMITH_FEATURE_ID` | Numeric Flagsmith feature ID for `defense_variant`. |
| `FLAGSMITH_LURIEN_MV_ID` | Numeric multivariate option ID for the `lurien` arm. |
| `GEMINI_API_KEY` | Google AI Studio API key for Gemini (`gemini-2.5-flash`), used server-side only. |
| `LURIEN_API_URL` | Live Lurien Matrix Firewall endpoint URL for pre/post-LLM inspection. |
| `LURIEN_API_KEY` | Bearer/API key for authenticating requests to `LURIEN_API_URL`. |
| `DATABASE_URL` | libsql/Turso connection URL (e.g., `file:./pwnlab.db` in dev or `libsql://...` in production). |
| `ADMIN_PASSWORD` | Admin password (minimum 12 characters, never `changeme`) required to approve/confirm/cancel rollouts on `/ship`. |
| `CRON_SECRET` | Bearer secret required in the `Authorization` header for `/api/cron`. |
| `SIMULATED_DB` | Set to `true` only for local/simulated testing; must be `false` or unset in production (blocks `/ship` mutations when active). |
| `EXPERIMENT_MIN_SAMPLE` | Minimum distinct identities required per arm before the ship gate can pass (default `75`). |
| `PREREG_COMMIT` | Git commit hash of the frozen `hypothesis.md` pre-registration record, linked from `/method`. |

---

## 3. Verification Scripts (`verify-*`)

Before launching, validate every live external integration using the included verification scripts:

- `npx tsx scripts/verify-db.ts` — **PASS:** DB schema init, insert/read/delete round-trip succeeds.
- `npx tsx scripts/verify-flagsmith.ts` — **PASS:** `attempt`/`benign_success`/`breach` events all synced (`synced: true`).
- `npx tsx scripts/verify-lurien.ts` — **PASS:** benign input → `blocked: false`, adversarial → `blocked: true` (live Lurien service).
- `npx tsx scripts/verify-management.ts` — **PASS:** Flagsmith Management API GET returns 200 with feature data (requires correct `FLAGSMITH_ENVIRONMENT_ID`).

```bash
npx tsx scripts/verify-db.ts
npx tsx scripts/verify-flagsmith.ts
npx tsx scripts/verify-lurien.ts
npx tsx scripts/verify-management.ts
```

All scripts exit with a non-zero exit code if required environment keys are missing or if any contract check fails.

---

## 4. Running Locally & Testing

Install dependencies:
```bash
npm install
```

Run Vitest suite:
```bash
npm test
```

Run production build check:
```bash
npm run build
```

Run Next.js dev server:
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000):
- **`/`**: Landing page with live telemetry, per-arm sample progress bars, and pre-registered hypothesis.
- **`/arena`**: Jailbreak arena with "Break It" and "Legit Mode" and research logging notice.
- **`/results`**: Live telemetry, sample progress bars, Flagsmith retry queue status, and breach-by-attack-class matrix.
- **`/leaderboard`**: Rankings of attacker handles by turns-to-breach.
- **`/ship`**: Statistical gate recommendation and human approval console (blocked on simulated DBs).
- **`/method`**: Methodological protocol, privacy notice, and `PREREG_COMMIT` link.

---

## 5. Stopping Rule

Data collection concludes when **both arms** reach the minimum sample size ($n \ge 75$ identities per arm, $N \ge 150$ total), or at the fixed stopping cutoff timestamp recorded in `hypothesis.md` (**2026-12-05T00:00:00Z**), whichever occurs first. Once reached, intake is frozen and the statistical ship gate evaluates the final dataset.

---

## 6. Statistical Ship Gate & Rollout Protocol

1. Navigate to **`/ship`**.
2. If $n \ge 75$ per variant and all criteria pass:
   - Bayesian win probability $P(\text{win}) \ge 95\%$ on breach rate.
   - Benign non-inferiority 95% CI lower bound $> -3\text{pp}$ vs control.
   - P95 latency $\le 5000\text{ms}$.
   - Average cost $\le \$0.01/\text{turn}$.
3. Enter `ADMIN_PASSWORD` and click **Approve Staged Rollout (24h)**.
4. The server calls the **Flagsmith Management API** to set the winning variant weight to 100%.
5. Click **Confirm Permanent Rollout** within 24 hours to seal, or **Cancel & Rollback** to revert to 50/50 split.

*(Note: Management actions return `403 Forbidden` if `isSimulatedDb()` is active).*

---

## 7. Automated Rollback & Retry Cron

A monitoring cron (`/api/cron`) requires `Authorization: Bearer $CRON_SECRET`. It retries any failed Flagsmith sync events in `flagsmith_event_queue` and audits the live breach rate of any deployed variant. If the breach rate exceeds `15%`, or if the 24-hour staging window expires unconfirmed, it triggers an automatic rollback to a 50/50 split.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron
```

> **Vercel Hobby Cron Note:** The `vercel.json` cron runs hourly (`/api/cron` at `0 * * * *`). Vercel Hobby plan limits crons to 1/day — upgrade to Pro for hourly execution, or use an external/manual cron trigger.

---

## 8. Launch Checklist

- [ ] `hypothesis.md` committed and frozen; `PREREG_COMMIT` set (run `git rev-parse HEAD` after your first commit and set `PREREG_COMMIT=<hash>` in `.env.local`).
- [ ] Flagsmith `defense_variant` configured for 2 arms: 1 feature = `defense_variant`, 1 MV option = `lurien` (50%), base value = `control` (50%).
- [ ] `ADMIN_PASSWORD` changed from default (minimum 12 characters) and `CRON_SECRET` set to a strong secret.
- [ ] `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` configured for production (no `DEV_DATABASE_URL` or `*.db` deployed).
- [ ] Set `SIMULATED_DB=false` (or unset) in production.
- [ ] Run `npm ci && npm test && npm run build` — all must pass.
- [ ] Run all `verify-*` scripts (`verify-db.ts`, `verify-flagsmith.ts`, `verify-lurien.ts`, `verify-management.ts`) — all pass with exit code 0.
- [ ] Pre-launch test data purged once via:
  ```bash
  npx tsx scripts/reset-launch-data.ts --confirm --db-url="<your-production-db-url>"
  ```
- [ ] Cron job configured to hit `/api/cron` (hourly on Vercel Pro or via external trigger) with `Authorization: Bearer $CRON_SECRET`.
