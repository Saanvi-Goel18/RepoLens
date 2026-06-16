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

async function analyzeWithLLM(files, staticIssues) {
    const groq = getGroqClient();

    // 1. Prepare context
    const fileContext = files.map(f =>
        `\n--- FILE: ${f.path} ---\n${f.content}\n--- END FILE ---`
    ).join("\n");

    const staticContext = staticIssues.length > 0
        ? `\n--- STATIC ANALYSIS ISSUES FOUND ---\n${JSON.stringify(staticIssues, null, 2)}\n--- END STATIC ISSUES ---`
        : `\n--- NO STATIC ISSUES FOUND ---`;

    const systemPrompt = `You are RepoLens, an expert code reviewer. Score the codebase on 5 categories (0-100 each) and list specific issues found.

RUBRIC: Security (30%), Scalability (20%), Code Quality (20%), Production Readiness (20%), Maintainability (10%).
Scoring guide: 85+ excellent, 65-84 good, 45-64 needs work, <45 critical issues. Typical vibe-coded app: 50-60.

Do NOT duplicate issues already in the static analysis results. Focus on architecture, logic flaws, missing abstractions.

RESPOND WITH ONLY THIS JSON — no markdown, no extra text:
{
  "categoryScores": { "security": 0-100, "scalability": 0-100, "quality": 0-100, "production": 0-100, "maintainability": 0-100 },
  "issues": [{ "category": "Security|Scalability|Code Quality|Production Readiness|Maintainability", "severity": "Critical|Warning|Info", "file": "string", "line": 1, "description": "string", "fix": "string" }]
}`;

    const userPrompt = `Please analyze the following codebase context and static analysis results.\n${staticContext}\n\n${fileContext}`;

    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        const resultText = response.choices[0].message.content;
        const parsed = JSON.parse(resultText);

        // Normalise — Groq occasionally wraps the result in a top-level key
        const report = parsed.categoryScores ? parsed : (Object.values(parsed)[0] || parsed);

        // Ensure all required keys exist with sane defaults
        const scores = report.categoryScores || {};
        return {
            categoryScores: {
                security:        typeof scores.security        === "number" ? scores.security        : 50,
                scalability:     typeof scores.scalability     === "number" ? scores.scalability     : 50,
                quality:         typeof scores.quality         === "number" ? scores.quality         : 50,
                production:      typeof scores.production      === "number" ? scores.production      : 50,
                maintainability: typeof scores.maintainability === "number" ? scores.maintainability : 50,
            },
            issues: Array.isArray(report.issues) ? report.issues : []
        };

    } catch (error) {
        console.error("LLM Analysis failed:", error.message);
        throw error;
    }
}

module.exports = { analyzeWithLLM };
