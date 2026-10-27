/**
 * Merges static analysis issues with LLM issues and computes the final weighted score.
 */

function computeFinalScores(llmReport, staticIssues) {
    function dedupeFindings(findings) {
        const seen = new Set();
        return findings.filter(f => {
            const key = `${f.file}:${f.line}:${f.category}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // 1. Dedupe static issues to avoid double-penalizing, then merge and dedupe with LLM
    const dedupedStatic = dedupeFindings(staticIssues);
    const allIssues = dedupeFindings([...dedupedStatic, ...(llmReport.issues || [])]);

    // 2. Start with LLM's baseline scores
    const scores = { ...llmReport.categoryScores };

    // 3. Apply penalties based on static issues, with diminishing returns per category.
    // A flat per-issue penalty makes "many similar issues" and "one catastrophic issue"
    // both bottom out at 0 — indistinguishable, and not proportionate to severity. Each
    // subsequent issue in the same category counts for less (worst-first), so the score
    // still reflects "how bad is the worst problem" rather than just "how many problems".
    function catKeyFor(category) {
        if (category.includes("Security")) return "security";
        if (category.includes("Scalability")) return "scalability";
        if (category.includes("Quality")) return "quality";
        if (category.includes("Production")) return "production";
        if (category.includes("Maintainability")) return "maintainability";
        return null;
    }

    const BASE_PENALTY = {
        security: { Critical: 30, Warning: 10, Info: 2 },
        default: { Critical: 20, Warning: 5, Info: 1 }
    };
    const SEVERITY_RANK = { Critical: 0, Warning: 1, Info: 2 };
    const DECAY = 0.75; // 1st issue = full penalty, 2nd = 75%, 3rd = 56%, ...

    const issuesByCategory = {};
    for (const issue of dedupedStatic) {
        const catKey = catKeyFor(issue.category);
        if (!catKey || scores[catKey] === undefined) continue;
        (issuesByCategory[catKey] ||= []).push(issue);
    }

    for (const [catKey, catIssues] of Object.entries(issuesByCategory)) {
        catIssues.sort((a, b) =>
            (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
        );
        const penaltyTable = BASE_PENALTY[catKey] || BASE_PENALTY.default;
        let totalPenalty = 0;
        catIssues.forEach((issue, idx) => {
            const base = penaltyTable[issue.severity] ?? penaltyTable.Info;
            totalPenalty += base * Math.pow(DECAY, idx);
        });
        scores[catKey] = Math.max(0, scores[catKey] - totalPenalty);
    }

    // Decayed penalties are fractional — round so the UI/PDF show whole-number scores.
    for (const key of Object.keys(scores)) {
        if (typeof scores[key] === "number") scores[key] = Math.round(scores[key]);
    }

    // 4. Compute overall weighted score
    const overallScore = Math.round(
        (scores.security * 0.30) +
        (scores.scalability * 0.20) +
        (scores.quality * 0.20) +
        (scores.production * 0.20) +
        (scores.maintainability * 0.10)
    );

    // 5. Sort issues by severity (Critical first)
    const severityMap = { "Critical": 0, "Warning": 1, "Info": 2 };
    allIssues.sort((a, b) => {
        const sa = severityMap[a.severity] !== undefined ? severityMap[a.severity] : 99;
        const sb = severityMap[b.severity] !== undefined ? severityMap[b.severity] : 99;
        return sa - sb;
    });

    return {
        overallScore,
        categoryScores: scores,
        issues: allIssues
    };
}

module.exports = {
    computeFinalScores
};
