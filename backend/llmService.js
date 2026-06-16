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

    const systemPrompt = `You are RepoLens, an expert AI code reviewer.
Your job is to review a codebase and provide a structured health report based on a specific rubric.
Review the provided files and the static analysis issues already found by our deterministic tools.

RUBRIC CATEGORIES:
1. Security (30% weight): Auth logic, JWTs, injection vulnerabilities, CORS, etc.
2. Scalability (20% weight): N+1 queries, synchronous blocking ops, caching, pagination.
3. Code Quality (20% weight): Consistent module systems, complexity, God objects, error handling.
4. Production Readiness (20% weight): Env vars, structured logging, health checks, PM2/Docker config.
5. Maintainability (10% weight): Folder structure, README quality, test presence.

INSTRUCTIONS:
1. Provide a score from 0-100 for each category based on your contextual review of the code.
2. Provide a list of specific issues you find. Do NOT duplicate issues already in the static analysis.
3. Focus on logical flaws, missing abstraction layers, architectural issues, etc.
4. Be strict but fair. A standard vibe-coded app usually scores around 50-60.

CRITICAL: You MUST respond with ONLY valid JSON matching exactly this structure — no markdown, no explanation:
{
  "categoryScores": {
    "security": <number 0-100>,
    "scalability": <number 0-100>,
    "quality": <number 0-100>,
    "production": <number 0-100>,
    "maintainability": <number 0-100>
  },
  "issues": [
    {
      "category": <one of: "Security"|"Scalability"|"Code Quality"|"Production Readiness"|"Maintainability">,
      "severity": <one of: "Critical"|"Warning"|"Info">,
      "file": <string>,
      "line": <number>,
      "description": <string>,
      "fix": <string>
    }
  ]
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
