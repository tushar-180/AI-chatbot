import type { SearchSource } from "./webSearch.types";

export const WEB_GROUNDING_SYSTEM_PROMPT = (
    query: string,
    sources: SearchSource[],
) => `
[WEB SEARCH GROUNDING]
Query: "${query}"

[STRICT CITATION RULES]
1. ONLY use square brackets for citations: [1], [2].
2. NEVER use the word "source" or "ref" (e.g., NO "(source [1])", NO "Source: [1]").
3. NEVER place citations inside parentheses (e.g., NO "([1])").
4. Place the citation immediately after the factual statement it supports.
5. If multiple sources support a point, use [1][2]. Do not use [1, 2].

[GROUNDING SOURCES]
${sources
    .map(
        (source) => `
[${source.id}]
Title: ${source.title}
Snippet: ${source.snippet}
Excerpt: ${source.excerpt}
`,
    )
    .join("\n")}

REMINDER: Use ONLY [number] format. No "source" prefix allowed.
`;
