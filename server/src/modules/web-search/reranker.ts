import type { ExtractedPage } from "./cache";
import type { SearchSource } from "./webSearch.types";

const MAX_EXCERPT_CHARS = 1000;

const WINDOW_SIZE = 1800;
const WINDOW_OVERLAP = 300;

const TITLE_WEIGHT = 4.5;
const SNIPPET_WEIGHT = 2.5;
const WINDOW_WEIGHT = 5.5;

const CONSTRAINT_MATCH_BONUS = 10;
const CONSTRAINT_MISS_PENALTY = 8;

const FRESHNESS_WEIGHT = 2.5;
const STRUCTURED_WEIGHT = 1.5;

const ENTITY_MATCH_WEIGHT = 3;
const DENSITY_WEIGHT = 2;

const ANSWERABILITY_WEIGHT = 5;
const TITLE_MISMATCH_PENALTY = 12;

const CROSS_SOURCE_WEIGHT = 2.5;

const normalize = (text: string): string =>
    text.toLowerCase().replace(/\s+/g, " ").trim();

const tokenize = (text: string): string[] =>
    normalize(text)
        .split(/[^a-z0-9./:_-]+/)
        .filter((t) => t.length > 1);

const unique = <T>(arr: T[]): T[] => [...new Set(arr)];

const STOPWORDS = new Set([
    "what",
    "which",
    "when",
    "where",
    "who",
    "why",
    "how",
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "that",
    "this",
    "about",
    "have",
    "has",
    "had",
    "will",
    "would",
    "could",
    "should",
    "your",
    "their",
    "there",
    "than",
    "then",
    "them",
    "they",
    "you",
    "are",
    "was",
    "were",
    "been",
    "being",
    "after",
    "before",
]);

const isImportantToken = (token: string): boolean => {
    if (STOPWORDS.has(token)) return false;

    if (token.length >= 4) return true;

    if (/\d/.test(token)) return true;

    if (/[/:.-]/.test(token)) return true;

    return false;
};

const extractImportantTokens = (query: string): string[] =>
    unique(tokenize(query).filter(isImportantToken));

const extractConstraints = (query: string): string[] => {
    const normalized = normalize(query);

    const constraints = new Set<string>();

    for (const match of normalized.match(/"([^"]+)"/g) || []) {
        constraints.add(match.replace(/"/g, "").trim());
    }

    for (const match of normalized.match(
        /\b[a-z]*\d+(?:\.\d+)*(?:\/\d+)?\b/g,
    ) || []) {
        constraints.add(match);
    }

    const words = normalized.split(/\s+/);

    for (let i = 0; i < words.length - 1; i++) {
        const phrase = `${words[i]} ${words[i + 1]}`;

        if (
            phrase.length >= 10 &&
            !STOPWORDS.has(words[i]) &&
            !STOPWORDS.has(words[i + 1])
        ) {
            constraints.add(phrase);
        }
    }

    return [...constraints];
};

const extractEntities = (query: string): string[] => {
    return unique(
        query
            .split(/\s+/)
            .filter((word) => {
                if (word.length < 3) return false;

                if (/\d/.test(word)) return true;

                return /^[A-Z][a-zA-Z0-9]+/.test(word);
            })
            .map((w) => w.toLowerCase()),
    );
};

const scoreTokenOverlap = (queryTokens: string[], text: string): number => {
    const haystack = normalize(text);

    let score = 0;

    for (const token of queryTokens) {
        if (haystack.includes(token)) {
            score += 1;
        }
    }

    return score;
};

const scoreConstraintMatches = (
    constraints: string[],
    text: string,
): number => {
    const haystack = normalize(text);

    let score = 0;

    for (const constraint of constraints) {
        if (haystack.includes(constraint)) {
            score += CONSTRAINT_MATCH_BONUS;
        }
    }

    return score;
};

const scoreConstraintPenalty = (
    constraints: string[],
    text: string,
): number => {
    const haystack = normalize(text);

    let penalty = 0;

    for (const constraint of constraints) {
        if (!haystack.includes(constraint)) {
            penalty += CONSTRAINT_MISS_PENALTY;
        }
    }

    return penalty;
};

const scoreEntityMatches = (entities: string[], text: string): number => {
    const haystack = normalize(text);

    let score = 0;

    for (const entity of entities) {
        if (haystack.includes(entity)) {
            score += ENTITY_MATCH_WEIGHT;
        }
    }

    return score;
};

const scoreSemanticDensity = (queryTokens: string[], text: string): number => {
    const tokens = tokenize(text);

    if (!tokens.length) return 0;

    let matches = 0;

    for (const token of tokens) {
        if (queryTokens.includes(token)) {
            matches += 1;
        }
    }

    return (matches / tokens.length) * 100;
};

const scoreAnswerability = (query: string, text: string): number => {
    const lowerQuery = normalize(query);
    const lowerText = normalize(text);

    let score = 0;

    if (
        /\b(most|best|top|highest|lowest|largest|smallest)\b/.test(lowerQuery)
    ) {
        if (/\b(top|rank|leader|highest|most|first)\b/.test(lowerText)) {
            score += ANSWERABILITY_WEIGHT;
        }
    }

    if (/\b(compare|difference|versus|vs)\b/.test(lowerQuery)) {
        if (/\b(compare|comparison|whereas|while|however)\b/.test(lowerText)) {
            score += ANSWERABILITY_WEIGHT;
        }
    }

    if (/\b(how|why)\b/.test(lowerQuery)) {
        if (
            /\b(because|due to|therefore|caused by|results in)\b/.test(
                lowerText,
            )
        ) {
            score += ANSWERABILITY_WEIGHT;
        }
    }

    return score;
};

const scoreTitleAlignment = (queryTokens: string[], title: string): number => {
    const normalizedTitle = normalize(title);

    let matched = 0;

    for (const token of queryTokens) {
        if (normalizedTitle.includes(token)) {
            matched += 1;
        }
    }

    const ratio = queryTokens.length > 0 ? matched / queryTokens.length : 0;

    if (ratio >= 0.7) return 10;

    if (ratio >= 0.4) return 4;

    if (ratio <= 0.15) return -TITLE_MISMATCH_PENALTY;

    return 0;
};

const splitIntoWindows = (text: string): string[] => {
    const windows: string[] = [];

    for (
        let start = 0;
        start < text.length;
        start += WINDOW_SIZE - WINDOW_OVERLAP
    ) {
        windows.push(text.slice(start, start + WINDOW_SIZE));
    }

    return windows;
};

const findBestWindow = (
    query: string,
    queryTokens: string[],
    constraints: string[],
    entities: string[],
    text: string,
) => {
    const windows = splitIntoWindows(text);

    let bestScore = -Infinity;
    let bestWindow = text.slice(0, WINDOW_SIZE);

    for (const window of windows) {
        const overlap = scoreTokenOverlap(queryTokens, window);

        const constraintScore = scoreConstraintMatches(constraints, window);

        const constraintPenalty = scoreConstraintPenalty(constraints, window);

        const entityScore = scoreEntityMatches(entities, window);

        const density = scoreSemanticDensity(queryTokens, window);

        const answerability = scoreAnswerability(query, window);

        const score =
            overlap * WINDOW_WEIGHT +
            constraintScore +
            entityScore +
            density * DENSITY_WEIGHT +
            answerability -
            constraintPenalty;

        if (score > bestScore) {
            bestScore = score;
            bestWindow = window;
        }
    }

    return {
        score: bestScore,
        excerpt: bestWindow.slice(0, MAX_EXCERPT_CHARS),
    };
};

const scoreCrossSourceAgreement = (
    currentPage: ExtractedPage,
    allPages: ExtractedPage[],
    queryTokens: string[],
): number => {
    let score = 0;

    const currentCombined = normalize(
        `${currentPage.title} ${currentPage.snippet}`,
    );

    for (const otherPage of allPages) {
        if (otherPage.url === currentPage.url) continue;

        const otherCombined = normalize(
            `${otherPage.title} ${otherPage.snippet}`,
        );

        let overlap = 0;

        for (const token of queryTokens) {
            if (
                currentCombined.includes(token) &&
                otherCombined.includes(token)
            ) {
                overlap += 1;
            }
        }

        if (overlap >= Math.max(2, queryTokens.length * 0.4)) {
            score += CROSS_SOURCE_WEIGHT;
        }
    }

    return score;
};

export const localRerank = (params: {
    query: string;
    pages: Array<
        ExtractedPage & {
            freshnessScore: number;
            structuredScore: number;
        }
    >;
    maxSourceCount: number;
}): SearchSource[] => {
    const { query, pages, maxSourceCount } = params;

    const queryTokens = extractImportantTokens(query);

    const constraints = extractConstraints(query);

    const entities = extractEntities(query);

    const scoredPages = pages.map((page) => {
        const combined = `${page.title}\n${page.snippet}\n${page.text}`;

        const titleScore =
            scoreTokenOverlap(queryTokens, page.title) * TITLE_WEIGHT +
            scoreConstraintMatches(constraints, page.title) +
            scoreEntityMatches(entities, page.title) +
            scoreTitleAlignment(queryTokens, page.title);

        const snippetScore =
            scoreTokenOverlap(queryTokens, page.snippet) * SNIPPET_WEIGHT +
            scoreConstraintMatches(constraints, page.snippet) +
            scoreEntityMatches(entities, page.snippet);

        const bestWindow = findBestWindow(
            query,
            queryTokens,
            constraints,
            entities,
            page.text,
        );

        const semanticDensity = scoreSemanticDensity(queryTokens, combined);

        const answerability = scoreAnswerability(query, combined);

        const crossSourceAgreement = scoreCrossSourceAgreement(
            page,
            pages,
            queryTokens,
        );

        const constraintPenalty = scoreConstraintPenalty(
            constraints,
            `${page.title} ${page.snippet}`,
        );

        const finalScore =
            titleScore +
            snippetScore +
            bestWindow.score +
            semanticDensity * DENSITY_WEIGHT +
            answerability +
            crossSourceAgreement +
            page.freshnessScore * FRESHNESS_WEIGHT +
            page.structuredScore * STRUCTURED_WEIGHT -
            constraintPenalty;

        return {
            page,
            score: finalScore,
            excerpt: bestWindow.excerpt,
        };
    });

    return scoredPages
        .sort((a, b) => b.score - a.score)
        .slice(0, maxSourceCount)
        .map((item, index) => ({
            id: index + 1,
            title: item.page.title,
            url: item.page.url,
            hostname: item.page.hostname,
            snippet: item.page.snippet,
            excerpt: item.excerpt,
            score: Number(item.score.toFixed(2)),
            freshnessScore: item.page.freshnessScore,
            structuredScore: item.page.structuredScore,
            publishedAt: item.page.publishedAt,
            lastModified: item.page.lastModified,
            cacheHit: true,
        }));
};
