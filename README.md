<div align="center">

<img src="https://img.shields.io/badge/RepoLens-AI%20Code%20Reviewer-6366f1?style=for-the-badge&logo=github&logoColor=white" alt="RepoLens" />

<h1>🔍 RepoLens</h1>

<p><strong>An AI-powered code health analyzer that reviews any public GitHub repository in seconds.</strong><br/>
Combines deterministic static analysis with contextual LLM review to produce a structured, weighted health report.</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/React-Vite-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?style=flat-square&logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/GitHub-Octokit-181717?style=flat-square&logo=github&logoColor=white" />
  <img src="https://img.shields.io/badge/OSV-Vulnerability%20DB-red?style=flat-square" />
  <img src="https://github.com/Saanvi-Goel18/RepoLens/actions/workflows/ci.yml/badge.svg" alt="CI" />
</p>

<p>
  <a href="#-demo">View Demo</a> ·
  <a href="#-how-it-works">How It Works</a> ·
  <a href="#-getting-started">Getting Started</a> ·
  <a href="#-architecture">Architecture</a>
</p>

</div>

---

## 🎯 The Problem

Vibe-coded apps work — until they don't. They ship with hardcoded API keys, no rate limiting, vulnerable dependencies, and broken async patterns. Existing tools like CodeRabbit live inside pull requests and require team setup. ChatGPT gives generic advice without a repeatable rubric.

**RepoLens gives you a structured, scored health report for any GitHub repository in under 30 seconds — no login, no CI/CD, no installation.**

---

## ✨ Features

- **Zero Setup** — Paste a GitHub URL. That's it.
- **GitHub OAuth Integration** — Securely authenticate to scan private repositories with ease.
- **Premium Deep Dark Aesthetic** — Vercel-inspired UI with sophisticated `Playfair Display` serif typography, smooth ScrollSpy navigation, and unified dark `#0a0a0a` surfaces.
- **Async Job Queue** — Submits analysis as a background job (`202 Accepted`), polls for results. Handles large repos without timeouts.
- **Hybrid Analysis Engine** — 4 static detectors + 1 LLM layer running concurrently.
- **Weighted Score System** — Overall health score (0-100) computed across 5 rubric categories.
- **Expandable Issue Reports** — Every issue comes with a file path, line number, severity, and a concrete fix suggestion.
- **Production-safe Boot** — Backend starts cleanly even without API keys configured; errors surface at the job level, not the server level.

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
    │  Fetches content in priority order, enforcing an 80,000-token budget.
    │
    ▼
[3] Static Analysis Layer  (runs in parallel via Promise.all)
    │  ├─ ESLint Linter       — Programmatic AST-based code quality checks
    │  ├─ Secrets Detector    — Regex scan for API keys, JWTs, hardcoded credentials
    │  ├─ Vibe-code Detector  — Flags missing rate limits, poor async patterns, mixed module systems
    │  └─ OSV Dependency Audit — Batch queries the OSV vulnerability DB for all npm dependencies
    │
    ▼
[4] LLM Analysis (GPT-4o-mini + Structured JSON Schema)
    │  Receives file contents + static issues as context.
    │  Returns category scores and additional architectural issues
    │  via strict JSON schema enforcement (no hallucinated formats).
    │
    ▼
[5] Score Merger
    │  Uses LLM scores as the baseline.
    │  Applies deterministic penalties for static issues:
    │    Critical security issue  → -30 from security score
    │    Critical other issue     → -20 from category score
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
| Token Management | tiktoken | Exact token counting (not estimation) for GPT context budget |
| LLM | Groq (llama-3.3-70b-versatile) | Free API, OpenAI-compatible, fast inference; `json_object` response format ensures structured output |
| Vulnerability Data | OSV API (batch) | Free, open, authoritative vulnerability database — no API key needed |
| Frontend | React + Vite | Fast HMR during development, optimized production builds |
| Routing | React Router v6 | Client-side routing for `/` and `/r/:jobId` report pages |
| Icons | Lucide React | Consistent, lightweight icon system |

---

## 📁 Project Structure

```
repolens/
├── backend/
│   ├── index.js              # Express server, job queue, analysis pipeline orchestrator
│   ├── githubService.js      # Octokit wrapper: fetchRepoTree, fetchFileContent
│   ├── prioritizer.js        # File scoring + token-budget-aware content fetcher
│   ├── linter.js             # Programmatic ESLint runner
│   ├── scorer.js             # Score merger: static penalties + weighted overall score
│   ├── llmService.js         # OpenAI integration with strict JSON schema prompting
│   ├── audit.js              # OSV vulnerability DB batch query
│   └── detectors/
│       ├── secrets.js        # Hardcoded credentials regex detector
│       └── vibe.js           # Missing rate limits, bad async, mixed module systems
└── frontend/
    └── src/
        ├── App.jsx           # Router setup
        └── pages/
            ├── Home.jsx      # URL input, hero section
            └── Dashboard.jsx # Score cards, issue list, polling
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- A GitHub Personal Access Token ([generate here](https://github.com/settings/tokens)) — needed for higher API rate limits
- An OpenAI API Key ([get one here](https://platform.openai.com/api-keys))

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

Create a `.env` file:
```env
GITHUB_TOKEN=ghp_your_token_here
OPENAI_API_KEY=sk-your_key_here
PORT=3001
```

Start the backend:
```bash
npm run dev
```

### 3. Start the frontend
```bash
cd ../frontend
npm install
npm run dev
```

### 4. Open the app
Navigate to **http://localhost:5173**, paste any public GitHub repo URL, and click **Analyze**.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `POST` | `/analyze` | Submit a repo URL for analysis. Returns `{ jobId }` immediately (`202 Accepted`). |
| `GET` | `/result/:jobId` | Poll for job status. Returns `queued`, `fetching`, `analyzing`, `done`, or `error`. |

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

| Category | Weight | What's Evaluated |
|---|---|---|
| 🔐 Security | 30% | Hardcoded secrets, missing auth middleware, CORS config, vulnerable deps |
| ⚡ Scalability | 20% | N+1 queries, synchronous blocking ops, pagination, caching |
| ✨ Code Quality | 20% | ESLint issues, module consistency, error handling, complexity |
| 🚢 Production Readiness | 20% | Env var usage, structured logging, health checks, Docker/PM2 config |
| 🧹 Maintainability | 10% | Folder structure, README quality, test coverage |

**Static issues override LLM scores:** A hardcoded API key detected by the secrets scanner immediately applies a -30 penalty to the security score, regardless of what the LLM says.

---

## 📄 License

MIT © [Saanvi Goel](https://github.com/Saanvi-Goel18)
