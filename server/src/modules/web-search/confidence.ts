import type {
    ConfidenceEstimate,
    SearchSource,
    WebGroundingContext,
} from "../../types/web-search.types";

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

    // Freshness and relevance scores come from the reranker (no authority metric)
    const avgFreshness = average(sources.map((s) => s.freshnessScore ?? 0.5));
    const avgRerankScore = average(sources.map((s) => s.score ?? 0));

    // Revised weights (no hardcoded authority)
    const WEIGHTS = {
        freshness: 0.3,
        relevance: 0.5,
        extraction: 0.2,
    };

    let score =
        WEIGHTS.freshness * avgFreshness + WEIGHTS.relevance * avgRerankScore;

    // Adjust for extraction quality
    if (percentFullExtraction >= 0.8) {
        score += WEIGHTS.extraction * 0.15;
    } else if (percentFullExtraction >= 0.5) {
        score += WEIGHTS.extraction * 0.05;
    } else {
        score -= WEIGHTS.extraction * 0.15;
    }

    // Source count bonus (multiple sources increase confidence)
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

    // Replace authority reasons with ranking score insights
    if (avgRerankScore >= 0.7) {
        reasons.push("Search engine ranking confidence is high.");
    }

    if (avgFreshness >= 0.75) {
        reasons.push("Information is recent, improving trustworthiness.");
    }

    if (sources.length >= 2) {
        reasons.push(
            "Multiple independent sources corroborate the information.",
        );
    }

    if (avgFreshness < 0.4 && avgRerankScore < 0.4) {
        reasons.push("Sources are limited in both relevance and freshness.");
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
