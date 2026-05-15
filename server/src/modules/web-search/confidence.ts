import type {
    ConfidenceEstimate,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

const average = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

export const estimateConfidence = (params: {
    sources: SearchSource[];
}): ConfidenceEstimate => {
    const { sources } = params;

    if (!sources.length) {
        return {
            score: 0.15,
            label: "low",
            reasons: ["No relevant search results were found."],
        };
    }

    // Use the snippetFallback flag directly from the service
    const snippetFallbackSources = sources.filter((s) => s.snippetFallback);
    const fullExtractionSources = sources.filter((s) => !s.snippetFallback);

    const percentFullExtraction =
        sources.length > 0 ? fullExtractionSources.length / sources.length : 0;

    const avgStructured = average(sources.map((s) => s.structuredScore ?? 0.5));
    const avgFreshness = average(sources.map((s) => s.freshnessScore ?? 0.5));
    const avgRerankScore = average(sources.map((s) => s.score ?? 0));

    const WEIGHTS = {
        authority: 0.3,
        freshness: 0.22,
        relevance: 0.28,
        extraction: 0.2,
    };

    let score =
        WEIGHTS.authority * avgStructured +
        WEIGHTS.freshness * avgFreshness +
        WEIGHTS.relevance * avgRerankScore;

    if (percentFullExtraction >= 0.8) {
        score += WEIGHTS.extraction * 0.15;
    } else if (percentFullExtraction >= 0.5) {
        score += WEIGHTS.extraction * 0.05;
    } else {
        score -= WEIGHTS.extraction * 0.15;
    }

    const sourceCountBonus = Math.min(0.1, (sources.length - 1) * 0.04);
    score += sourceCountBonus;

    if (sources.length === 1) {
        score -= 0.1;
    }

    score = clamp(score, 0.05, 0.95);

    let label: ConfidenceEstimate["label"];
    if (score >= 0.75) label = "high";
    else if (score >= 0.45) label = "medium";
    else label = "low";

    const reasons: string[] = [];

    if (fullExtractionSources.length === sources.length) {
        reasons.push(
            "All sources provided full‑page content, allowing deep verification.",
        );
    } else if (fullExtractionSources.length > 0) {
        reasons.push(
            `${snippetFallbackSources.length} out of ${sources.length} sources relied on short snippets.`,
        );
    } else {
        reasons.push(
            "Confidence limited – only search snippets were available.",
        );
    }

    if (avgStructured >= 0.7) {
        reasons.push(
            "Sources come from well‑established, authoritative domains.",
        );
    }
    if (avgFreshness >= 0.75) {
        reasons.push("Information is recent, improving trustworthiness.");
    }
    if (sources.length >= 2) {
        reasons.push(
            "Multiple independent sources corroborate the information.",
        );
    }

    if (avgStructured < 0.4 && avgFreshness < 0.4) {
        reasons.push("Sources are limited in both authority and freshness.");
    }

    return {
        score: Number(score.toFixed(2)),
        label,
        reasons,
    };
};

export const withEstimatedConfidence = (
    context: Omit<WebGroundingContext, "confidence">,
): WebGroundingContext => ({
    ...context,
    confidence: estimateConfidence({ sources: context.sources }),
});
