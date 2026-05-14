import type {
    ConfidenceEstimate,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";

const average = (values: number[]) => {
    if (!values.length) return 0;

    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

export const estimateConfidence = (params: {
    sources: SearchSource[];
    usedSnippetFallback: boolean;
}): ConfidenceEstimate => {
    const { sources, usedSnippetFallback } = params;

    if (!sources.length) {
        return {
            score: 0.15,
            label: "low",
            reasons: ["No relevant search results were found."],
        };
    }

    const structuredScores = sources.map((s) => s.structuredScore || 0.5);
    const freshnessScores = sources.map((s) => s.freshnessScore || 0.5);
    const rerankScores = sources.map((s) => s.score || 0);
    const avgStructured = average(structuredScores);
    const avgFreshness = average(freshnessScores);
    const avgRerank = average(rerankScores);
    const sourceCountBonus = Math.min(0.15, sources.length * 0.04);
    const extractionBonus = usedSnippetFallback ? 0 : 0.12;
    const structureWeight = avgStructured * 0.28;
    const freshnessWeight = avgFreshness * 0.18;
    const rerankWeight = clamp(avgRerank, 0, 1) * 0.32;

    let confidenceScore =
        structureWeight +
        freshnessWeight +
        rerankWeight +
        sourceCountBonus +
        extractionBonus;

    // Penalize weak grounding
    if (usedSnippetFallback) {
        confidenceScore -= 0.18;
    }

    // Penalize single-source grounding
    if (sources.length === 1) {
        confidenceScore -= 0.12;
    }

    confidenceScore = clamp(confidenceScore, 0.05, 0.95);

    let label: ConfidenceEstimate["label"];

    if (confidenceScore >= 0.75) {
        label = "high";
    } else if (confidenceScore >= 0.45) {
        label = "medium";
    } else {
        label = "low";
    }

    const reasons: string[] = [];

    if (!usedSnippetFallback) {
        reasons.push(
            "Confidence improved through full-page extraction and reranking.",
        );
    } else {
        reasons.push(
            "Confidence limited because only search snippets were available.",
        );
    }

    if (avgStructured >= 0.7) {
        reasons.push("Sources come from relatively authoritative domains.");
    }

    if (avgFreshness >= 0.75) {
        reasons.push(
            "Search results contain recent or frequently updated information.",
        );
    }

    if (sources.length >= 2) {
        reasons.push("Multiple independent sources support the response.");
    }

    if (avgStructured < 0.4 && avgFreshness < 0.4) {
        reasons.push(
            "Available sources were limited in authority and freshness.",
        );
    }

    return {
        score: Number(confidenceScore.toFixed(2)),
        label,
        reasons,
    };
};

export const withEstimatedConfidence = (
    context: Omit<WebGroundingContext, "confidence">,
): WebGroundingContext => ({
    ...context,

    confidence: estimateConfidence({
        sources: context.sources,

        usedSnippetFallback:
            context.debug.sourceStrategy === "snippet-fallback",
    }),
});
