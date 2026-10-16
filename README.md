# Morocco IT Job Monitoring Agent (OpenRouter Free Edition)

An autonomous monitoring agent for Information Technology job postings and competitive civil service recruitment notices (*concours de recrutement*) in Morocco.

The agent scrapes Moroccan portals (including the official [Emploi-Public.ma](https://www.emploi-public.ma) portal), prefilters announcements to conserve quota, evaluates candidates using a 100% free **OpenRouter** model (such as `openrouter/free` or `google/gemma-4-31b-it:free`), sends real-time alerts via **Telegram**, and maintains atomic persistent state in `data/seen.json`.

---

## Architecture Overview

The system operates across two clear responsibilities:

1. **Cloudflare Worker (Interactive Telegram Bot + Matching + D1 Database)**
   - Receives Telegram updates via webhook with secret token verification.
   - Handles bilingual onboarding in **French & Arabic** with inline keyboards.
   - Manages user preferences, profile editing, pausing/resuming, manual searches, and GDPR account deletion.
   - Exposes a secured internal endpoint (`POST /api/ingest-jobs`) with timing-safe authentication.
   - Matches new job announcements against active user preferences and dispatches daily digests.

2. **GitHub Actions (Daily Job Collection Pipeline)**
   - Runs the existing scraper once daily at 08:00 UTC (09:00 Morocco time).
   - Enriches announcements with deadlines and specialities, prefiltering out expired and non-IT notices.
   - Normalizes and submits jobs to the Cloudflare Worker via the authenticated endpoint.

```
┌────────────────────────────────────────────────────────────────────────┐
│ GitHub Actions Daily Cron (08:00 UTC)                                  │
│  - Runs Scraper against Moroccan recruitment portals                   │
│  - Filters expired deadlines & verifies IT specialties                 │
│  - Normalizes and POSTs jobs to Worker (/api/ingest-jobs)              │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ Authenticated HTTPS (x-internal-secret)
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker + Cloudflare D1 Database                             │
│  - Ingests & deduplicates announcements into D1                        │
│  - Evaluates matching jobs for every active user profile               │
│  - Prevents duplicate alerts via idempotent notifications table        │
│  - Sends bilingual daily digests via Telegram Bot API                  │
└─────────────────────────────────▲──────────────────────────────────────┘
                                  │ Webhook (X-Telegram-Bot-Api-Secret-Token)
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Multi-User Telegram Subscribers                                        │
│  - Bilingual onboarding (/start): Français / العربية                   │
│  - Commands: /help, /profile, /edit, /language, /pause, /resume,       │
│              /search, /delete_me                                       │
│  - Preferences in D1: Specialties, Grades, Locations, Sector           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Creating a Free OpenRouter Account & API Key

1. Go to [openrouter.ai](https://openrouter.ai).
2. Sign in with your Google or GitHub account (or email).
3. Navigate to [openrouter.ai/keys](https://openrouter.ai/keys).
4. Click **Create Key**, give it a name (e.g. `morocco-job-monitor`), and copy the key (starts with `sk-or-v1-...`).
5. **Zero Spend / No Credit Card:** OpenRouter free models (ending with `:free` or `openrouter/free`) are 100% free with $0 balance required!

---

## 2. Supported Free Models on OpenRouter

OpenRouter hosts dedicated free models with $0.00 prompt and completion cost:

- **`openrouter/free`** (Recommended Default): A smart dynamic router that automatically routes requests to the fastest, most available free model from OpenRouter's pool.
- **`google/gemma-4-31b-it:free`**: 262k context window, exceptional French and Arabic language comprehension for Moroccan diplomas and concurso notices.
- **`google/gemma-4-26b-a4b-it:free`**: Fast multimodal free model.
- **`nvidia/nemotron-3.5-lightning:free`**: Ultra-low latency, highly capable instruction model.
- **`cohere/north-mini-code:free`**: Specialized IT and coding model.
- **`liquid/lfm-2.5-2.6b:free`**: Lightweight, responsive free model.

You can verify any model's live availability and free status using the built-in CLI:

```bash
# Verify default free model:
npx tsx src/cli.ts --verify-model

# Verify a specific model:
npx tsx src/cli.ts --verify-model google/gemma-4-31b-it:free
```

---

## 3. Creating the Telegram Bot Using BotFather

1. Open Telegram and search for the official account **`@BotFather`** (verified checkmark).
2. Start the chat and send the command `/newbot`.
3. Choose a friendly name for your bot (e.g., `Morocco IT Job Alerts`).
4. Choose a username ending in `bot` (e.g., `morocco_it_jobs_alert_bot`).
5. BotFather will provide an HTTP API token formatted like:
   `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`
6. Set this as `TELEGRAM_BOT_TOKEN`.

---

## 4. Retrieving Your Telegram Chat ID

1. Open a chat with your newly created bot and click **Start** (or send `/start`).
2. Search for the utility bot **`@userinfobot`** on Telegram.
3. Send `/start` to `@userinfobot`. It will reply with your numeric `Id` (e.g., `987654321`).
4. Set this number as `TELEGRAM_CHAT_ID`.

*(If using a Telegram channel or group, add your bot as an administrator and use the channel ID, e.g., `-100xxxxxxxxxx`.)*

---

## 5. Configuring Local Environment Variables

Copy the template configuration file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_MODEL="openrouter/free"
TELEGRAM_BOT_TOKEN="123456789:..."
TELEGRAM_CHAT_ID="987654321"
FIRST_RUN_MAX_NOTIFICATIONS="5"
MAX_NOTIFICATIONS_PER_RUN="10"
```

---

## 6. Running Tests and a Dry Run

### Run All Unit and Integration Tests
```bash
npm test
```
The test suite validates mock OpenRouter inference responses, valid/malformed JSON, rate limits, quota exhaustion, exponential backoff retries, Telegram formatting, and atomic state handling without requiring real credentials.

### Run a Safe Dry Run
```bash
# Using live Moroccan recruitment portal:
npm run monitor:dry

# Or using built-in Moroccan IT test fixtures:
npm run monitor:dry -- --demo
```
In dry-run mode, the agent simulates evaluation, displays decision reasoning, prints simulated Telegram notifications, and **never writes to `data/seen.json` or sends live messages**.

### Run Production Monitor
```bash
npm run monitor
```

---

## 7. Configuring GitHub Actions Secrets & Variables

In your GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**.
2. Under **Repository secrets**, click **New repository secret** and add:
   - `OPENROUTER_API_KEY`: Your OpenRouter free API key (`sk-or-v1-...`).
   - `TELEGRAM_BOT_TOKEN`: The bot token from BotFather.
   - `TELEGRAM_CHAT_ID`: Your destination numeric chat ID.
3. Under **Repository variables** (optional):
   - `OPENROUTER_MODEL`: `openrouter/free` (or `google/gemma-4-31b-it:free`).

*(Note: Legacy `HF_TOKEN` and `HF_MODEL` continue to be supported as an optional fallback if configured).*

---

## 8. Enabling the Daily Schedule

The GitHub Actions workflow is located at `.github/workflows/job-monitor.yml`.

- **Cron Schedule:** `0 8 * * *` (runs once each day at 08:00 UTC / 09:00 Morocco time).
- **Concurrency Guard:** Prevents overlapping runs.
- **Pre-execution Verification:** Runs `npm test` before executing the scraper.
- **Lockfile Resolution:** Automatically detects presence of `package-lock.json` and runs `npm ci` or `npm install`.
- **State Persistence:** Automatically commits updated `data/seen.json` back to the repository upon completion with `[skip ci]`.
- **Manual Trigger:** You can trigger the workflow anytime from the **Actions** tab with optional dry-run and demo inputs.

---

## 9. Multi-User Telegram Bot Setup (Cloudflare Workers + D1)

The multi-user Telegram service extends the agent so that multiple candidates across Morocco can interactively subscribe, customize preferences (specialties, grades, cities), and receive a tailored daily digest in **French** or **Arabic**.

### Prerequisites
- [Node.js 20+](https://nodejs.org) and npm installed.
- A free [Cloudflare](https://dash.cloudflare.com) account.
- A Telegram account and Bot token from `@BotFather`.
- GitHub account for running scheduled collections.

### Step 1: Install Wrangler and Authenticate
```bash
npx wrangler login
```

### Step 2: Create Cloudflare D1 Database
Create the SQLite database on Cloudflare D1:
```bash
npx wrangler d1 create morocco_job_bot_db
```
The command outputs your `database_id` (e.g., `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). Open `wrangler.toml` and replace `LOCAL_OR_REMOTE_D1_DATABASE_ID` with your real database ID.

### Step 3: Run Database Migrations
Apply the initial schema (`migrations/0001_initial_schema.sql`):
```bash
# Apply to remote Cloudflare D1
npx wrangler d1 migrations apply morocco_job_bot_db --remote
```

### Step 4: Configure Cloudflare Worker Secrets
Generate strong random strings for your secrets (e.g. `openssl rand -hex 32`) and save them securely on Cloudflare Workers:
```bash
# Telegram Bot Token from @BotFather
npx wrangler secret put TELEGRAM_BOT_TOKEN

# Secret shared between GitHub Actions and your Worker endpoint
npx wrangler secret put INTERNAL_API_SECRET

# Secret token used by Telegram webhook header X-Telegram-Bot-Api-Secret-Token
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

### Step 5: Deploy the Cloudflare Worker
```bash
npm run worker:deploy
# or: npx wrangler deploy
```
Wrangler will output your live Worker URL:
`https://morocco-it-jobs-bot.<your-subdomain>.workers.dev`

### Step 6: Configure Telegram Webhook
Register your Cloudflare Worker URL with Telegram and enforce secret token validation:
```bash
curl -F "url=https://morocco-it-jobs-bot.<your-subdomain>.workers.dev/webhook" \
     -F "secret_token=<YOUR_TELEGRAM_WEBHOOK_SECRET>" \
     https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
```
Telegram will respond with `{"ok":true,"result":true,"description":"Webhook was set"}`.

### Step 7: Configure GitHub Repository Secrets
In your GitHub repo (**Settings → Secrets and variables → Actions**), add:
- `CF_WORKER_URL`: `https://morocco-it-jobs-bot.<your-subdomain>.workers.dev`
- `INTERNAL_API_SECRET`: The exact secret configured in Step 4.
- `OPENROUTER_API_KEY`: Your OpenRouter API key.

### Step 8: Test Job Ingestion Locally or from GitHub
```bash
# Dry run job collection & submission
CF_WORKER_URL=https://morocco-it-jobs-bot.<your-subdomain>.workers.dev \
INTERNAL_API_SECRET=your_secret \
npm run submit:jobs:demo -- --dry-run

# Production collection & submission
npm run submit:jobs
```

---

## 10. Telegram User Commands & Onboarding Flow

| Command | Purpose |
| :--- | :--- |
| `/start` | Launch the bot, select language (Français / العربية), and start guided onboarding. |
| `/help` | Display command usage and available options. |
| `/profile` | View saved search preferences and subscription status. |
| `/edit` | Update target specialties, public grades, location, and optional filters. |
| `/language` | Switch communication language between French and Arabic at any time. |
| `/pause` | Temporarily pause daily notifications without losing criteria. |
| `/resume` | Reactivate daily notifications. |
| `/search` | Run a real-time search of recently scraped jobs matching your profile (rate limited). |
| `/delete_me` | Request irreversible deletion of user profile, preferences, and notification records. |

### Configurable Specialties & Public Grades
- **Specialties:** Informatique générale, Développement logiciel, Développement web, Réseaux et systèmes, Cybersécurité, Data et IA, Support informatique, Test & QA, DevOps et Cloud, Autre.
- **Grades:** Technicien de 3ème grade (Échelle 9), Technicien de 4ème grade (Échelle 8), Technicien Spécialisé (DTS / DUT / BTS), Technicien (DT), Ingénieur d'État (Échelle 11), Administrateur (2e / 3e grade), Autre (saisie libre).
- **Locations:** Tout le Maroc, Casablanca-Settat, Rabat-Salé-Kénitra, Tanger-Tétouan, Marrakech-Safi, Fès-Meknès, Oriental, Souss-Massa, or custom city text.

---

## 11. Cost & Free Tier Resource Limits

| Component | Free Tier Quota | Typical Daily Usage |
| :--- | :--- | :--- |
| **Cloudflare Workers** | 100,000 requests/day | ~500 - 2,000 requests/day |
| **Cloudflare D1** | 5,000,000 row reads & 100,000 row writes/day | < 5,000 reads & < 500 writes/day |
| **GitHub Actions** | 2,000 build minutes/month | ~15 minutes/month (1 run/day × 30s) |
| **Telegram Bot API** | 100% Free (30 messages/sec limit) | ~1 - 50 messages/day with pacing |
| **OpenRouter / HF** | Free models ($0.00 / token) | Prefiltered to only relevant notices |

---

## 12. Privacy & GDPR Account Deletion

The bot is designed with data minimization in mind:
- Only Telegram `chat_id` and chosen preferences are stored.
- When a user sends `/delete_me` and confirms, their profile row in the `users` table is deleted, which automatically cascades and deletes all related rows in `user_preferences`, `user_conversations`, and `notifications`.
- No personal user chat logs or credentials are ever stored in GitHub Actions or public logs.

---

## 13. Troubleshooting Guide

| Problem | Cause | Resolution |
| :--- | :--- | :--- |
| `[AUTH_FAILURE] 401/403` | Invalid or expired token | Verify `OPENROUTER_API_KEY` starts with `sk-or-v1-` and was created at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `[QUOTA_EXHAUSTED] 402` | Monthly free credit exhausted | The agent pauses AI evaluation gracefully. Un-evaluated jobs remain retryable. Use `openrouter/free` to leverage free pool models. |
| `[RATE_LIMIT] 429` | Too many calls per minute | The agent automatically performs exponential backoff retries with jitter (up to 3 times). |
| `[PROVIDER_UNAVAILABLE] 503` | Upstream provider busy | The agent automatically retries with exponential backoff. |
| `Telegram error: 400 Chat not found` | Bot was not started | Open your bot in Telegram and send `/start` before running the agent. |
| `No jobs scraped` | Moroccan portal connectivity glitch | The agent automatically falls back to safe fixtures and preserves state. |

---

## 14. Zero-Cost Protection Guarantee

- **100% Free Models:** OpenRouter free models have zero dollar prompt and completion pricing.
- **No Automatic Charges:** The agent code **strictly forbids** registering paid fallback providers or initiating automatic payment.
- **Graceful Halt:** When credits are exhausted, the agent reports the issue and stops. It **never fabricates** synthetic decisions or marks unevaluated jobs as rejected.
- **Conservative Token Budget:** Low token caps (~500 tokens) and prefiltering ensure maximum efficiency.
