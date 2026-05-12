import type { ExtractedPage } from "./cache";
import type { SearchSource } from "./webSearch.types";

const MAX_EXCERPT_CHARS = 900;
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;

const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
};

const scoreText = (queryTokens: string[], text: string): number => {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    const regex = new RegExp(`\\b${token}\\b`, "gi");
    const matches = haystack.match(regex);
    if (matches) {
      score += matches.length;
    }
  }
  return score;
};

const chunkText = (text: string): string[] => {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
};

export const localRerank = (params: {
  query: string;
  pages: Array<
    ExtractedPage & { freshnessScore: number; structuredScore: number }
  >;
  maxSourceCount: number;
}): SearchSource[] => {
  const { query, pages, maxSourceCount } = params;
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return pages.slice(0, maxSourceCount).map((page, i) => ({
      id: i + 1,
      title: page.title,
      url: page.url,
      hostname: page.hostname,
      snippet: page.snippet,
      excerpt: page.text.slice(0, MAX_EXCERPT_CHARS),
      score: 1,
      freshnessScore: page.freshnessScore,
      structuredScore: page.structuredScore,
      publishedAt: page.publishedAt,
      lastModified: page.lastModified,
      cacheHit: true,
    }));
  }

  const allChunks = pages.flatMap((page) => {
    const chunks = chunkText(page.text);
    return chunks.map((chunk) => {
      const keywordScore = scoreText(queryTokens, chunk);
      const titleScore = scoreText(queryTokens, page.title) * 2;
      const snippetScore = scoreText(queryTokens, page.snippet);

      const baseScore = keywordScore + titleScore + snippetScore;
      const finalScore =
        baseScore * 0.7 +
        page.freshnessScore * 10 +
        page.structuredScore * 5;

      return {
        page,
        chunk,
        score: finalScore,
      };
    });
  });

  const sortedChunks = allChunks.sort((a, b) => b.score - a.score);
  const seenUrls = new Set<string>();
  const results: SearchSource[] = [];

  for (const item of sortedChunks) {
    if (seenUrls.has(item.page.url)) continue;
    seenUrls.add(item.page.url);

    results.push({
      id: 0,
      title: item.page.title,
      url: item.page.url,
      hostname: item.page.hostname,
      snippet: item.page.snippet,
      excerpt: item.chunk.slice(0, MAX_EXCERPT_CHARS),
      score: Number(item.score.toFixed(2)),
      freshnessScore: item.page.freshnessScore,
      structuredScore: item.page.structuredScore,
      publishedAt: item.page.publishedAt,
      lastModified: item.page.lastModified,
      cacheHit: true,
    });

    if (results.length >= maxSourceCount) break;
  }

  return results.map((s, i) => ({ ...s, id: i + 1 }));
};
