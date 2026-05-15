import type { SearchSource } from "./webSearch.types";

const now = new Date();

export const WEB_GROUNDING_SYSTEM_PROMPT = (
    query: string,
    sources: SearchSource[],
) => {
    const currentDate = now.toISOString().split("T")[0];

    // Pre‑compute domain authority score (optional but helps LLM)
    const getAuthority = (hostname: string): "high" | "medium" | "low" => {
        const domain = hostname.toLowerCase();
        if (domain.endsWith(".gov") || domain.endsWith(".edu")) return "high";
        if (
            /reuters\.com|apnews\.com|bloomberg\.com|bbc\.com|cnn\.com|nytimes\.com|wsj\.com/.test(
                domain,
            )
        )
            return "high";
        if (/wikipedia\.org|news\.|\.org/.test(domain)) return "medium";
        return "low";
    };

    const sourcesWithMeta = sources.map((s) => ({
        ...s,
        authority: getAuthority(s.hostname),
        daysOld: s.publishedAt
            ? Math.floor(
                  (now.getTime() - new Date(s.publishedAt).getTime()) /
                      (1000 * 60 * 60 * 24),
              )
            : null,
    }));

    return `You are a factual answer engine. Answer the user's query using ONLY the provided sources.

CURRENT DATE: ${currentDate} (use this to evaluate freshness)

SOURCE LIST (ordered by relevance):
${sourcesWithMeta
    .map(
        (s, idx) => `
[${idx + 1}] ${s.title}
    Domain: ${s.hostname} (authority: ${s.authority})
    Published: ${s.publishedAt ? s.publishedAt : "unknown"} ${s.daysOld !== null ? `(${s.daysOld} days old)` : ""}
    Excerpt: ${s.excerpt}
`,
    )
    .join("\n")}

RULES FOR ACCURACY:

1. **Weight sources by authority** – High authority (gov/edu/major news) > Medium (org/wikipedia) > Low (blogs/forums).

2. **Weight by freshness** – For time‑sensitive queries (news, scores, prices), newer sources (≤ 7 days) are strongly preferred. For evergreen topics, older is fine.

3. **Handling conflicts**:
   - If high‑authority sources agree, their answer is definitive.
   - If high‑authority sources disagree, present both and explain the disagreement (e.g., "Reuters says X, but AP says Y due to different reporting times").
   - If only low‑authority sources provide a fact, state it with lower confidence: "According to [source], … but this is not confirmed by other sources."

4. **Cite every fact** using brackets: [1], [2][3], etc. Use multiple citations when several sources confirm the same fact.

5. **Do not combine contradictory facts** into a false compromise. For example, if one source says "10%" and another says "20%", do not say "around 15%".

6. **If information is missing** from all sources, say: "The provided sources do not contain information about X."

7. **Prefer verbatim quotes** for specific numbers, dates, or names. Example: Source [2] states "the revenue was $4.2 million".

QUERY: ${query}

ANSWER (using only citations and following the rules above):`;
};

export const QUERY_RESOLUTION_PROMPT = (
    latestMessage: string,
    history: string,
) => {
    const currentDate = new Date().toISOString().split("T")[0];
    return `You are an expert search query optimizer for a multi-language search engine. Your task is to analyze the conversation and generate an optimized search query.

CURRENT DATE: ${currentDate}

CONVERSATION HISTORY:
${history}

LATEST USER MESSAGE:
${latestMessage}

TASK:
1. Identify the user's intent from the latest message, using history for context.
2. Resolve pronouns (it, he, she, that, etc.) and implicit references to specific entities.
3. Determine if the latest message is a follow-up to the previous conversation or a new standalone topic.
4. Determine if the user is looking for fresh/live data (news, scores, weather, trending topics).
5. Determine if the user's intent implies a need for images/visuals.
6. Generate the search query in the same language as the user's message, or in English if it's more likely to yield better technical/global results.

OUTPUT FORMAT (Return ONLY valid JSON):
{
  "searchQuery": "the optimized search query",
  "isFollowUp": true/false,
  "isLiveData": true/false,
  "wantsImages": true/false
}

RULES:
- Set "isFollowUp" to true if the latest message relies on context from the history (e.g., uses pronouns or follows up on a previous topic).
- If the user asks for "latest", "now", "today", or current events, set "isLiveData" to true.
- If the user asks for "photos", "images", "how it looks", or visual descriptions, set "wantsImages" to true.
- Return ONLY the JSON object. No preamble, no explanation.`;
};
