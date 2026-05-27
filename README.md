# 🔍 RepoLens

**Instant Health Report for your GitHub Repo**

RepoLens is an AI-powered code reviewer designed to give you an immediate, structured health report for any public GitHub repository. No setup, no CI/CD integration, and no pull requests required. Paste a URL and get a score across 5 key metrics: Security, Scalability, Code Quality, Production Readiness, and Maintainability.

## 🚀 Why RepoLens?
The problem with "vibe-coded" applications isn't that they don't work—it's that they work until they don't. They ship with hardcoded secrets, no rate limiting, and missing error handlers. 

Existing tools like CodeRabbit live inside PRs and require team setups. Conversational AI lacks a structured, repeatable rubric. RepoLens combines **Deterministic Static Analysis** with **Contextual LLM Analysis** to give you the best of both worlds in seconds.

## ✨ Features
- **URL Input**: Paste any GitHub repository URL.
- **File Prioritizer**: Automatically detects and scores high-value files (entry points, auth logic, DB models) to stay within LLM context windows.
- **Hybrid Analysis Engine**:
  - *Static Layer*: Programmatic ESLint, Regex secrets detection, custom vibe-code detectors (missing rate limits, poor error handling), and OSV Dependency Audits.
  - *LLM Layer*: Analyzes architectural patterns and logical flaws using strict JSON schema prompting.
- **Score Merger**: Deterministic static flags (like a leaked API key) override and penalize LLM baseline scores to ensure security rules are strictly enforced.
- **Beautiful Dashboard**: Glassmorphism UI with expandable issue lists categorized by severity.

## 🛠️ Tech Stack
- **Frontend**: React, Vite, React Router, Lucide Icons
- **Backend**: Node.js, Express, Octokit (GitHub API)
- **AI/Analysis**: OpenAI (GPT-4o-mini), ESLint programmatic API, OSV vulnerability API

## 🚦 Getting Started

### Prerequisites
- Node.js v18+
- GitHub Personal Access Token (for API rate limits)
- OpenAI API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Saanvi-Goel18/RepoLens.git
   cd RepoLens
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Add your GITHUB_TOKEN and OPENAI_API_KEY to the .env file
   npm run dev
   ```

3. **Setup Frontend**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

4. **Run**
   Navigate to `http://localhost:5173` in your browser.

## 📸 Demo
*(Add your demo GIF here)*

## 📄 License
MIT
