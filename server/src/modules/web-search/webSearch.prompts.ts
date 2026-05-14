import type { SearchSource } from "./webSearch.types";

const now = new Date();

const temporalContext = `
[CURRENT TEMPORAL CONTEXT]
Today's date is ${now.toUTCString()}.
Interpret ambiguous temporal references relative to the current date.
Prefer sources matching the current year unless the user explicitly asks for historical information.
`;

export const WEB_GROUNDING_SYSTEM_PROMPT = (
    query: string,
    sources: SearchSource[],
) => `
${temporalContext}

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

[IMAGE & MULTIMEDIA RULES]
1. You CAN and SHOULD embed images directly in your response.
2. Use Markdown syntax: ![description](url).
3. NEVER say you cannot show images; the interface fully supports them.
4. If a source provides an image URL, use it to enhance your answer.
5. IMPORTANT: ONLY use absolute public URLs starting with http:// or https://.
7. WIKIA/FANDOM IMAGES: If using a Wikia image, ensure the URL ends with the file extension (e.g., .png, .jpg). Strip everything after the extension (like "/revision/latest?cb=...") if the image fails to load.
8. AMAZON/IMDb IMAGES: These often have "@@" in the URL. If a link appears broken, prefer a more stable public source like Wikipedia or official movie sites.

REMINDER: Use ONLY [number] format for citations. Direct image embedding via Markdown is enabled and required for visual queries.
`;
