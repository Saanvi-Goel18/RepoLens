/**
 * Merges static analysis issues with LLM issues and computes the final weighted score.
 */

function computeFinalScores(llmReport, staticIssues) {
    // 1. Merge all issues
    const allIssues = [...staticIssues, ...(llmReport.issues || [])];

    // 2. Start with LLM's baseline scores
    const scores = { ...llmReport.categoryScores };

    // 3. Apply penalties based on static issues
    for (const issue of staticIssues) {
        let catKey = "";
        if (issue.category.includes("Security")) catKey = "security";
        else if (issue.category.includes("Scalability")) catKey = "scalability";
        else if (issue.category.includes("Quality")) catKey = "quality";
        else if (issue.category.includes("Production")) catKey = "production";
        else if (issue.category.includes("Maintainability")) catKey = "maintainability";
        
        if (catKey && scores[catKey] !== undefined) {
            let penalty = 0;
            if (catKey === "security") {
                penalty = issue.severity === "Critical" ? 30 : 10;
            } else {
                penalty = issue.severity === "Critical" ? 20 : 5;
            }
            
            scores[catKey] = Math.max(0, scores[catKey] - penalty);
        }
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
