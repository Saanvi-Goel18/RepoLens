const OpenAI = require("openai");

let groqInstance = null;

// Groq uses the OpenAI-compatible API — just swap the baseURL and key.
function getGroqClient() {
    if (!groqInstance) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY environment variable is missing. Please add it to your .env file.");
        }
        groqInstance = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1"
        });
    }
    return groqInstance;
}

// Condense static issues to short one-liners so every chunk can see them
// without spending the full JSON payload's worth of tokens on repeated context.
function summarizeStaticIssues(staticIssues, maxItems = 40) {
    if (!staticIssues || staticIssues.length === 0) return "\n--- NO STATIC ISSUES FOUND ---";
    const lines = staticIssues.slice(0, maxItems).map(i =>
        `${i.file}:${i.line} [${i.severity}] ${i.category}: ${i.description}`
    );
    const overflow = staticIssues.length - lines.length;
    if (overflow > 0) lines.push(`(+${overflow} more static issues not shown)`);
    return `\n--- STATIC ANALYSIS ISSUES FOUND (whole repo, for cross-file context) ---\n${lines.join("\n")}\n--- END STATIC ISSUES ---`;
}

// Cheap whole-repo file list so a chunk isn't reasoning about its files in isolation
// (e.g. it can tell an unauthenticated route exists elsewhere, or spot duplicated logic).
function summarizeRepoMap(repoPaths, maxItems = 200) {
    if (!repoPaths || repoPaths.length === 0) return "";
    const shown = repoPaths.slice(0, maxItems).join("\n");
    const overflow = repoPaths.length - Math.min(repoPaths.length, maxItems);
    return `\n--- FULL REPO FILE LIST (for structural context; not all files shown below have content in this chunk) ---\n${shown}${overflow > 0 ? `\n(+${overflow} more files)` : ""}\n--- END FILE LIST ---`;
}

async function analyzeWithLLM(files, staticIssues, repoPaths = []) {
    const groq = getGroqClient();

    // 1. Prepare context
    const fileContext = files.map(f =>
        `\n--- FILE: ${f.path} ---\n${f.content}\n--- END FILE ---`
    ).join("\n");

    const staticContext = summarizeStaticIssues(staticIssues);
    const repoMapContext = summarizeRepoMap(repoPaths);

    const systemPrompt = `You are RepoLens, an expert code reviewer. Score the codebase on 5 categories (0-100 each) and list specific issues found.

RUBRIC: Security (30%), Scalability (20%), Code Quality (20%), Production Readiness (20%), Maintainability (10%).
Scoring guide: 85+ excellent, 65-84 good, 45-64 needs work, <45 critical issues. Typical vibe-coded app: 50-60.

You are reviewing one chunk of files from a larger repo. The full repo file list and the full set of static-analysis issues (found across ALL chunks, not just this one) are provided below for context — use them to reason about cross-file risk (e.g. a route in this chunk calling into a file with a known static issue), but do NOT re-report a static issue as your own finding, and do NOT factor already-flagged static issues into your numeric scores — those are already accounted for separately by the scoring system. Score as if those static issues don't exist. Focus on architecture, logic flaws, missing abstractions, and cross-file risk visible from the file list.
If the files in this chunk are completely irrelevant to a specific category (e.g. only CSS files, so no security issues), return \`null\` for that category's score.

RESPOND WITH ONLY THIS JSON — no markdown, no extra text:
{
  "categoryScores": { "security": 0-100 | null, "scalability": 0-100 | null, "quality": 0-100 | null, "production": 0-100 | null, "maintainability": 0-100 | null },
  "issues": [{ "category": "Security|Scalability|Code Quality|Production Readiness|Maintainability", "severity": "Critical|Warning|Info", "file": "string", "line": 1, "description": "string", "fix": "string" }]
}`;

    const userPrompt = `Please analyze the following codebase context and static analysis results.\n${staticContext}${repoMapContext}\n\n${fileContext}`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];

    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await groq.chat.completions.create({
                model: "openai/gpt-oss-120b",
                messages,
                response_format: { type: "json_object" },
                temperature: 0.1,
                reasoning_effort: "low",
                include_reasoning: false
            });

            const resultText = response.choices[0].message.content;
            const parsed = JSON.parse(resultText);

            // Normalise — Groq occasionally wraps the result in a top-level key
            const report = parsed.categoryScores ? parsed : (Object.values(parsed)[0] || parsed);

            // Ensure all required keys exist with sane defaults
            const scores = report.categoryScores || {};
            return {
                categoryScores: {
                    security:        scores.security        === null ? null : typeof scores.security        === "number" ? scores.security        : 50,
                    scalability:     scores.scalability     === null ? null : typeof scores.scalability     === "number" ? scores.scalability     : 50,
                    quality:         scores.quality         === null ? null : typeof scores.quality         === "number" ? scores.quality         : 50,
                    production:      scores.production      === null ? null : typeof scores.production      === "number" ? scores.production      : 50,
                    maintainability: scores.maintainability === null ? null : typeof scores.maintainability === "number" ? scores.maintainability : 50,
                },
                issues: Array.isArray(report.issues) ? report.issues : []
            };

        } catch (error) {
            const isRateLimit = error.status === 429 || error.code === "rate_limit_exceeded";
            if (isRateLimit && attempt < MAX_RETRIES) {
                // Respect the server's actual back-off window instead of a blind fixed sleep.
                const retryAfterHeader = error.headers?.["retry-after"];
                const waitSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : 20 * (attempt + 1);
                console.warn(`Rate limited by Groq, waiting ${waitSeconds}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
                await new Promise(r => setTimeout(r, waitSeconds * 1000));
                continue;
            }
            console.error("LLM Analysis failed:", error.message);
            throw error;
        }
    }
}

module.exports = { analyzeWithLLM };
