"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deduplicateCandidates = void 0;
const cosineSimilarity = (left, right) => {
    if (!left.length || left.length !== right.length)
        return 0;
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        leftNorm += left[index] * left[index];
        rightNorm += right[index] * right[index];
    }
    if (!leftNorm || !rightNorm)
        return 0;
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};
const normalizeCandidateKey = (candidate) => `${candidate.hostname}|${candidate.title}|${candidate.url}`
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/\/+$/g, "")
    .replace(/[^a-z0-9|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const summarizeCandidate = (candidate) => [candidate.title, candidate.snippet, candidate.hostname].filter(Boolean).join(" | ");
const deduplicateCandidates = (candidates, options) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const uniqueByKey = new Map();
    for (const candidate of candidates) {
        const key = normalizeCandidateKey(candidate);
        const existing = uniqueByKey.get(key);
        if (!existing) {
            uniqueByKey.set(key, candidate);
            continue;
        }
        const existingScore = (existing.structuredScore || 0) +
            (existing.freshnessScore || 0) +
            (existing.searchProviderScore || 0);
        const candidateScore = (candidate.structuredScore || 0) +
            (candidate.freshnessScore || 0) +
            (candidate.searchProviderScore || 0);
        if (candidateScore > existingScore) {
            uniqueByKey.set(key, candidate);
        }
    }
    const exactDeduped = [...uniqueByKey.values()];
    if (!(options === null || options === void 0 ? void 0 : options.getEmbeddings) || exactDeduped.length <= 2) {
        return exactDeduped;
    }
    const texts = exactDeduped.map(summarizeCandidate);
    const embeddings = yield options.getEmbeddings(texts);
    const threshold = (_a = options.semanticThreshold) !== null && _a !== void 0 ? _a : 0.965;
    const kept = [];
    const keptEmbeddings = [];
    exactDeduped.forEach((candidate, index) => {
        const embedding = embeddings[index];
        const isDuplicate = keptEmbeddings.some((existing) => cosineSimilarity(existing, embedding) >= threshold);
        if (!isDuplicate) {
            kept.push(candidate);
            keptEmbeddings.push(embedding);
            return;
        }
        const replacementIndex = kept.findIndex((existing, keptIndex) => cosineSimilarity(keptEmbeddings[keptIndex], embedding) >= threshold);
        if (replacementIndex === -1)
            return;
        const existing = kept[replacementIndex];
        const existingScore = (existing.structuredScore || 0) +
            (existing.freshnessScore || 0) +
            (existing.searchProviderScore || 0);
        const candidateScore = (candidate.structuredScore || 0) +
            (candidate.freshnessScore || 0) +
            (candidate.searchProviderScore || 0);
        if (candidateScore > existingScore) {
            kept[replacementIndex] = candidate;
            keptEmbeddings[replacementIndex] = embedding;
        }
    });
    return kept;
});
exports.deduplicateCandidates = deduplicateCandidates;
