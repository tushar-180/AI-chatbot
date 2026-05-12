import type { SearchCandidate } from "./webSearch.types";

const cosineSimilarity = (left: number[], right: number[]) => {
  if (!left.length || left.length !== right.length) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

const normalizeCandidateKey = (candidate: SearchCandidate) =>
  `${candidate.hostname}|${candidate.title}|${candidate.url}`
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/\/+$/g, "")
    .replace(/[^a-z0-9|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const summarizeCandidate = (candidate: SearchCandidate) =>
  [candidate.title, candidate.snippet, candidate.hostname].filter(Boolean).join(" | ");

export const deduplicateCandidates = async (
  candidates: SearchCandidate[],
): Promise<SearchCandidate[]> => {
  const uniqueByKey = new Map<string, SearchCandidate>();

  for (const candidate of candidates) {
    const key = normalizeCandidateKey(candidate);
    const existing = uniqueByKey.get(key);

    if (!existing) {
      uniqueByKey.set(key, candidate);
      continue;
    }

    const existingScore =
      (existing.structuredScore || 0) +
      (existing.freshnessScore || 0) +
      (existing.searchProviderScore || 0);
    const candidateScore =
      (candidate.structuredScore || 0) +
      (candidate.freshnessScore || 0) +
      (candidate.searchProviderScore || 0);

    if (candidateScore > existingScore) {
      uniqueByKey.set(key, candidate);
    }
  }

  return [...uniqueByKey.values()];
};
