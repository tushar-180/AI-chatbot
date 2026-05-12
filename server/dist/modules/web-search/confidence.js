"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withEstimatedConfidence = exports.estimateConfidence = void 0;
const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const estimateConfidence = (params) => {
    const { sources, liveDataQuery, cacheHit, usedSnippetFallback } = params;
    if (!sources.length) {
        return {
            score: 0.18,
            label: "low",
            reasons: ["No high-quality sources were available."],
        };
    }
    const averageScore = sources.reduce((sum, source) => sum + Math.max(source.score, 0), 0) /
        sources.length;
    const averageFreshness = sources.reduce((sum, source) => sum + (source.freshnessScore || 0), 0) /
        sources.length;
    const averageStructured = sources.reduce((sum, source) => sum + (source.structuredScore || 0), 0) /
        sources.length;
    let score = 0.25 +
        Math.min(averageScore / 2.5, 0.3) +
        averageFreshness * 0.2 +
        averageStructured * 0.15 +
        Math.min(sources.length / 5, 0.1);
    if (cacheHit && !liveDataQuery)
        score += 0.05;
    if (usedSnippetFallback)
        score -= 0.18;
    if (liveDataQuery && averageFreshness < 0.45)
        score -= 0.1;
    score = clamp(score);
    const reasons = [];
    if (averageStructured >= 0.7) {
        reasons.push("Structured or official-looking sources ranked near the top.");
    }
    if (averageFreshness >= 0.65) {
        reasons.push("Source freshness signals are strong.");
    }
    if (usedSnippetFallback) {
        reasons.push("Some evidence came from snippets instead of extracted pages.");
    }
    if (liveDataQuery && averageFreshness < 0.45) {
        reasons.push("This looks like a live-data query, but freshness signals are mixed.");
    }
    if (!reasons.length) {
        reasons.push("Confidence is based on source relevance, diversity, and freshness.");
    }
    return {
        score: Number(score.toFixed(2)),
        label: score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low",
        reasons,
    };
};
exports.estimateConfidence = estimateConfidence;
const withEstimatedConfidence = (context) => (Object.assign(Object.assign({}, context), { confidence: (0, exports.estimateConfidence)({
        sources: context.sources,
        liveDataQuery: context.liveDataQuery,
        cacheHit: context.debug.cacheHit,
        usedSnippetFallback: context.debug.sourceStrategy === "snippet-fallback",
    }) }));
exports.withEstimatedConfidence = withEstimatedConfidence;
