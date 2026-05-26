const OpenAI = require("openai");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const rubricSchema = {
    type: "object",
    properties: {
        categoryScores: {
            type: "object",
            properties: {
                security: { type: "number", description: "Score out of 100" },
                scalability: { type: "number", description: "Score out of 100" },
                quality: { type: "number", description: "Score out of 100" },
                production: { type: "number", description: "Score out of 100" },
                maintainability: { type: "number", description: "Score out of 100" }
            },
            required: ["security", "scalability", "quality", "production", "maintainability"],
            additionalProperties: false
        },
        issues: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    category: { 
                        type: "string", 
                        enum: ["Security", "Scalability", "Code Quality", "Production Readiness", "Maintainability"] 
                    },
                    severity: { 
                        type: "string", 
                        enum: ["Critical", "Warning", "Info"] 
                    },
                    file: { type: "string" },
                    line: { type: "number" },
                    description: { type: "string" },
                    fix: { type: "string" }
                },
                required: ["category", "severity", "file", "line", "description", "fix"],
                additionalProperties: false
            }
        }
    },
    required: ["categoryScores", "issues"],
    additionalProperties: false
};

async function analyzeWithLLM(files, staticIssues) {
    // 1. Prepare the context
    const fileContext = files.map(f => {
        return `\n--- FILE: ${f.path} ---\n${f.content}\n--- END FILE ---`;
    }).join("\n");

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
1. Provide a score from 0-100 for each category based purely on your contextual review of the code architecture and patterns.
2. Provide a list of specific, contextual issues you find. DO NOT duplicate issues already found by the static analysis (they are provided in the prompt), unless you are adding significant architectural context to them. 
3. Focus on logical flaws, missing layers of abstraction, missing indexes (if visible in schemas), etc.
4. Be strict but fair. A standard "vibe-coded" app usually scores around 50-60.
`;

    const userPrompt = `Please analyze the following codebase context and static analysis results.\n${staticContext}\n\n${fileContext}`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Using mini for speed/cost balance
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "RepoAnalysisReport",
                    schema: rubricSchema,
                    strict: true
                }
            },
            temperature: 0.1
        });

        const resultText = response.choices[0].message.content;
        return JSON.parse(resultText);
    } catch (error) {
        console.error("LLM Analysis failed:", error.message);
        throw error;
    }
}

module.exports = {
    analyzeWithLLM
};
