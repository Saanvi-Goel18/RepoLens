<div align="center">

<img src="https://img.shields.io/badge/RepoLens-AI%20Code%20Reviewer-6366f1?style=for-the-badge&logo=github&logoColor=white" alt="RepoLens" />

<h1>🔍 RepoLens</h1>

<p><strong>An AI-powered code health analyzer that reviews any GitHub repository (public, or private after GitHub sign-in).</strong><br/>
Combines deterministic static analysis with contextual LLM review to produce a structured, weighted health report.</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/React-Vite-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Groq-GPT_OSS_120B-f55036?style=flat-square" />
  <img src="https://img.shields.io/badge/GitHub-Octokit-181717?style=flat-square&logo=github&logoColor=white" />
  <img src="https://img.shields.io/badge/OSV-Vulnerability%20DB-red?style=flat-square" />
  <img src="https://github.com/Saanvi-Goel18/RepoLens/actions/workflows/ci.yml/badge.svg" alt="CI" />
</p>

<p><strong>🌐 Live: <a href="https://repo-lens-flame.vercel.app">repo-lens-flame.vercel.app</a></strong></p>

<p>
  <a href="#-how-it-works">How It Works</a> ·
  <a href="#-getting-started">Getting Started</a> ·
  <a href="#-api-reference">API Reference</a> ·
  <a href="#-scoring-rubric">Scoring Rubric</a>
</p>

</div>

---

## 🎯 The Problem

Vibe-coded apps work — until they don't. They ship with hardcoded API keys, no rate limiting, vulnerable dependencies, and broken async patterns. Existing tools like CodeRabbit live inside pull requests and require team setup. ChatGPT gives generic advice without a repeatable rubric.

**RepoLens gives you a structured, scored health report for any GitHub repository in a few minutes — no login needed for public repos, no CI/CD, no installation.**

---

## ✨ Features

- **Zero Setup** — Paste a GitHub URL. That's it.
- **GitHub OAuth Integration** — Securely authenticate to scan private repositories with ease.
- **Monochrome UI with Light/Dark Themes** — `Playfair Display` headlines, `JetBrains Mono` labels, consistent across the landing and report pages.
- **Background Processing** — Submits analysis as a background task (`202 Accepted`), polls for results; reports persist in PostgreSQL and survive restarts.
- **Hybrid Analysis Engine** — 10 static checks (gated by detected language) + a chunked LLM review.
- **Repository Explorer** — File tree with worst-severity markers per file/folder; click a file to filter issues.
- **PR Review Bot** — GitHub webhook runs the same pipeline on PR diffs and posts inline review comments.
- **History & PDF** — Score trend across rescans (PostgreSQL) and a downloadable PDF report.
- **Weighted Score System** — Overall health score (0-100) computed across 5 rubric categories.
- **Expandable Issue Reports** — Every issue comes with a file path, line number, severity, and a concrete fix suggestion.

---

## 🧠 How It Works

A single analysis request triggers a **5-stage pipeline**:

```
GitHub URL
    │
    ▼
[1] File Tree Fetch (Octokit)
    │  Fetches the full file tree of the repository via GitHub API.
    │
    ▼
[2] Intelligent File Prioritizer (tiktoken)
    │  Scores files by type (auth > models > routes > config).
    │  Fetches content in priority order, enforcing a 40,000-token budget.
    │
    ▼
[3] Static Analysis Layer  (runs in parallel via Promise.all)
    │  Universal: Secrets, Function Size, CI/CD, OSV Dependency Audit (npm/PyPI/Go)
    │  JS/TS-only (skipped if not detected): ESLint, SQL Injection, Blocking I/O,
    │    Debug Statements, Missing Error Handler; Vibe Checks (JS/TS/Python/Go)
    │
    ▼
[4] LLM Analysis (Groq GPT-OSS 120B, JSON mode)
    │  Files are split into ~4,500-token chunks (free-tier TPM limit).
    │  Each chunk also sees the repo file list + a summary of static issues.
    │  Per-category chunk scores are merged with min() (weakest link).
    │
    ▼
[5] Score Merger
    │  Uses LLM scores as the baseline.
    │  Applies deterministic penalties for static issues:
    │    Critical security issue  → -30 from security score
    │    Critical other issue     → -20 from category score
    │    Each further issue in a category counts 0.75x the previous (diminishing)
    │  Computes final weighted overall score:
    │    Security (30%) + Scalability (20%) + Quality (20%) + Production (20%) + Maintainability (10%)
    │
    ▼
 Final Health Report (JSON → Dashboard UI)
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend Runtime | Node.js + Express | Non-blocking I/O for concurrent API calls |
| GitHub Integration | Octokit (REST) | Official GitHub SDK, handles auth & rate limits |
| Token Management | tiktoken | Exact token counting (not estimation) for LLM context budget |
| LLM | Groq (openai/gpt-oss-120b) | Free API, OpenAI-compatible, 131K context, reasoning-capable; `json_object` response format ensures structured output |
| Vulnerability Data | OSV API (batch) | Free, open, authoritative vulnerability database — no API key needed |
| Frontend | React + Vite | Fast HMR during development, optimized production builds |
| Routing | React Router v6 | Client-side routing for `/` and `/r/:jobId` report pages |
| Icons | Lucide React + Material Symbols | Consistent, lightweight icon system |
| Database | PostgreSQL (pg) | Persists jobs and scan history (trend chart, shareable reports) |
| Auth | GitHub OAuth + JWT (HttpOnly cookie) | Private-repo scanning without storing the user's token |
| PR Bot | @octokit/webhooks | HMAC-verified webhook; posts inline PR review comments |
| PDF | jsPDF + autoTable | Client-side report export |

---

## 📁 Project Structure

```
repolens/
├── .github/workflows/ci.yml   # Runs backend tests on every push / PR
├── backend/
│   ├── index.js               # Express server, routes, auth, job lifecycle, runPipeline
│   ├── analysisPipeline.js    # Shared static + chunked-LLM pipeline (scan + PR webhook)
│   ├── githubService.js       # Octokit wrapper: repo tree, file content, access check
│   ├── prioritizer.js         # File weighting + tiktoken budget-aware fetcher
│   ├── llmService.js          # Groq call, prompt, retry/back-off, response normalisation
│   ├── scorer.js              # Dedupe, static penalties with decay, weighted score
│   ├── linter.js              # Programmatic ESLint (JS/TS)
│   ├── audit.js               # OSV batch vulnerability lookup (npm, PyPI, Go)
│   ├── db.js                  # PostgreSQL schema + queries (scans, jobs)
│   ├── webhookHandler.js      # GitHub PR review bot
│   ├── detectors/             # secrets, vibe, sqlInjection, blockingIO, debugStatements,
│   │                          # missingErrorHandler, oversizedFunctions, cicd
│   └── tests/                 # Plain-Node unit tests (npm test)
└── frontend/
    └── src/
        ├── App.jsx            # Router: / and /r/:jobId
        ├── ThemeContext.jsx   # Light/dark theme
        ├── pages/
        │   ├── Home.jsx       # Landing page, scan modal, GitHub sign-in
        │   └── Dashboard.jsx  # Report: scores, transparency, file tree, filters, issues, PDF
        └── components/
            ├── FileTree.jsx       # Repo explorer with per-file severity
            ├── HistoryChart.jsx   # Score trend across rescans
            └── ErrorBoundary.jsx
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- A **GitHub Personal Access Token** ([generate here](https://github.com/settings/tokens)) — gives you 5,000 API req/hr instead of 60
- A **Groq API Key** (free at [console.groq.com](https://console.groq.com)) — used for LLM analysis

### 1. Clone the repository
```bash
git clone https://github.com/Saanvi-Goel18/RepoLens.git
cd RepoLens
```

### 2. Configure the backend
```bash
cd backend
npm install
```

Copy the example env file and fill in your values:
```bash
cp .env.example .env
```

```env
GITHUB_TOKEN=ghp_your_token_here
GROQ_API_KEY=gsk_your_groq_key_here
DATABASE_URL=postgresql://user:password@host:5432/db
JWT_SECRET=a_long_random_string
FRONTEND_URL=http://localhost:5173
PORT=3001
```

See `backend/.env.example` for every variable (OAuth and webhook secrets are optional).

Start the backend:
```bash
npm run dev
```

### 3. Configure the frontend
```bash
cd ../frontend
npm install
```

Copy the example env file:
```bash
cp .env.example .env.local
```

```env
VITE_BACKEND_URL=http://localhost:3001
```

Start the frontend:
```bash
npm run dev
```

### 4. Open the app
Navigate to **http://localhost:5173**, paste any public GitHub repo URL, and click **Analyze**.

### 5. (Optional) Enable Private Repo Scanning via GitHub OAuth

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers) and click **New OAuth App**.
2. Set the **Authorization callback URL** to `http://localhost:3001/auth/github/callback`.
3. Copy the **Client ID** and generate a **Client Secret**.
4. Add them to your backend `.env`:
   ```env
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   ```
5. Add the Client ID to your frontend `.env.local`:
   ```env
   VITE_GITHUB_CLIENT_ID=your_client_id
   ```
6. Restart both servers. The **Sign in with GitHub** button will now work.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `POST` | `/analyze` | Submit a repo URL for analysis. Returns `{ jobId }` immediately (`202 Accepted`). |
| `GET` | `/result/:jobId` | Poll for job status. Returns `queued`, `fetching`, `analyzing`, `done`, or `error`. Falls back to the DB after a restart. |
| `GET` | `/trends/:owner/:repo` | Score history for a repository |
| `GET` | `/recent-scans` | Last 10 scans, anonymised (hashed repo id + score) |
| `GET` | `/auth/github` | Start GitHub OAuth (private repos) |
| `GET` | `/auth/github/callback` | OAuth callback; sets an HttpOnly JWT cookie |
| `GET` | `/auth/status` | `{ isAuthenticated }` |
| `POST` | `/auth/logout` | Clears the auth cookie |
| `POST` | `/webhook/github` | GitHub PR webhook (`pull_request.opened` / `synchronize`) |

`POST /analyze` is rate-limited to 5 requests per IP per 15 minutes.

**Example:**
```bash
# Submit
curl -X POST http://localhost:3001/analyze \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/expressjs/express"}'

# {"jobId":"abc-123","status":"queued"}

# Poll
curl http://localhost:3001/result/abc-123
```

---

## 📊 Scoring Rubric

The final score is a weighted average of 5 categories:

| Category | Weight | Static checks that feed it | LLM review looks at |
|---|---|---|---|
| 🔐 Security | 30% | Hardcoded secrets, committed `.env`, SQL injection patterns, OSV vulnerable deps, auth without rate limiting, Python `eval/exec` | Auth/authorization gaps, unsafe data flows |
| ⚡ Scalability | 20% | Blocking sync I/O in route files, Go `panic` | Inefficient queries, missing pagination/caching |
| ✨ Code Quality | 20% | ESLint, DB calls without try/catch, mixed module systems, debug statements | Logic flaws, duplication, missing abstractions |
| 🚢 Production Readiness | 20% | Missing Express error handler, missing `.env.example`, no CI/CD | Config, logging, deploy readiness |
| 🧹 Maintainability | 10% | Functions over 80 lines | Structure, readability |

**How the score is computed:** the LLM provides a baseline score per category (chunk scores merged with `min()`, weakest link). Static findings then subtract deterministic penalties: Critical −30 in Security / −20 elsewhere, Warning −10 / −5, Info −2 / −1. Each additional issue in the same category counts 0.75× the previous one, so many small issues don't outweigh one critical one. The LLM is told not to score static findings, so nothing is counted twice.

---

## 📄 License

MIT © [Saanvi Goel](https://github.com/Saanvi-Goel18)
