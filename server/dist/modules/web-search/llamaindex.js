"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.retrieveAndRerank = exports.createSemanticEmbedder = void 0;
const cache_1 = require("./cache");
const EMBEDDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SIMILARITY_TOP_K = 8;
const loadLlamaIndexRuntime = () => __awaiter(void 0, void 0, void 0, function* () {
    const llamaindexModuleName = "llamaindex";
    const openAIModuleName = "@llamaindex/openai";
    try {
        const [llamaindex, providers] = yield Promise.all([
            Promise.resolve(`${llamaindexModuleName}`).then(s => __importStar(require(s))),
            Promise.resolve(`${openAIModuleName}`).then(s => __importStar(require(s))),
        ]);
        return {
            llamaindex: llamaindex,
            providers: providers,
        };
    }
    catch (error) {
        throw new Error(`LlamaIndex runtime is not available. Install "llamaindex" and "@llamaindex/openai". ${String(error)}`);
    }
});
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
const extractNodeText = (node) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return String((_h = (_f = (_c = (_a = node === null || node === void 0 ? void 0 : node.text) !== null && _a !== void 0 ? _a : (_b = node === null || node === void 0 ? void 0 : node.node) === null || _b === void 0 ? void 0 : _b.text) !== null && _c !== void 0 ? _c : (_e = (_d = node === null || node === void 0 ? void 0 : node.node) === null || _d === void 0 ? void 0 : _d.getContent) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : (_g = node === null || node === void 0 ? void 0 : node.getContent) === null || _g === void 0 ? void 0 : _g.call(node)) !== null && _h !== void 0 ? _h : "").trim();
};
const extractNodeMetadata = (node) => {
    var _a;
    return ((node === null || node === void 0 ? void 0 : node.metadata) || ((_a = node === null || node === void 0 ? void 0 : node.node) === null || _a === void 0 ? void 0 : _a.metadata) || {}) ||
        {};
};
const getCachedOrCreateEmbedding = (embedMany, text) => __awaiter(void 0, void 0, void 0, function* () {
    const cached = (0, cache_1.getEmbeddingCache)(text);
    if (cached)
        return cached;
    const [embedding] = yield embedMany([text]);
    (0, cache_1.setEmbeddingCache)(text, embedding, EMBEDDING_CACHE_TTL_MS);
    return embedding;
});
const createSemanticEmbedder = () => __awaiter(void 0, void 0, void 0, function* () {
    const { providers } = yield loadLlamaIndexRuntime();
    const embedModel = new providers.OpenAIEmbedding({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.WEB_GROUNDING_EMBED_MODEL || "text-embedding-3-small",
    });
    return {
        embedTexts: (texts) => __awaiter(void 0, void 0, void 0, function* () {
            const pending = [];
            const pendingIndexes = [];
            const result = new Array(texts.length);
            texts.forEach((text, index) => {
                const cached = (0, cache_1.getEmbeddingCache)(text);
                if (cached) {
                    result[index] = cached;
                    return;
                }
                pending.push(text);
                pendingIndexes.push(index);
            });
            if (pending.length) {
                const embeddings = yield embedModel.getTextEmbeddings(pending);
                embeddings.forEach((embedding, index) => {
                    const targetIndex = pendingIndexes[index];
                    result[targetIndex] = embedding;
                    (0, cache_1.setEmbeddingCache)(pending[index], embedding, EMBEDDING_CACHE_TTL_MS);
                });
            }
            return result;
        }),
    };
});
exports.createSemanticEmbedder = createSemanticEmbedder;
const retrieveAndRerank = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { query, pages, maxSourceCount } = params;
    const { llamaindex, providers } = yield loadLlamaIndexRuntime();
    const embedModel = new providers.OpenAIEmbedding({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.WEB_GROUNDING_EMBED_MODEL || "text-embedding-3-small",
    });
    const splitter = new llamaindex.SentenceSplitter({
        chunkSize: 768,
        chunkOverlap: 120,
    });
    const chunkDocuments = pages.flatMap((page, pageIndex) => {
        const chunks = splitter.splitText(page.text).filter(Boolean);
        const chunkList = chunks.length ? chunks : [page.text];
        return chunkList.map((chunk, chunkIndex) => new llamaindex.Document({
            text: chunk,
            id_: `${page.url}#${pageIndex}-${chunkIndex}`,
            metadata: {
                title: page.title,
                url: page.url,
                hostname: page.hostname,
                snippet: page.snippet,
                publishedAt: page.publishedAt || null,
                lastModified: page.lastModified || null,
                freshnessScore: page.freshnessScore || 0,
                structuredScore: page.structuredScore || 0,
                cacheHit: true,
            },
        }));
    });
    if (!chunkDocuments.length)
        return [];
    return llamaindex.Settings.withEmbedModel(embedModel, () => __awaiter(void 0, void 0, void 0, function* () {
        const index = yield llamaindex.VectorStoreIndex.fromDocuments(chunkDocuments);
        const retriever = index.asRetriever({
            similarityTopK: Math.max(DEFAULT_SIMILARITY_TOP_K, maxSourceCount * 2),
        });
        const retrievedNodes = yield retriever.retrieve({ query });
        const queryEmbedding = yield getCachedOrCreateEmbedding(embedModel.getTextEmbeddings.bind(embedModel), query);
        const rerankedNodes = yield Promise.all(retrievedNodes.map((nodeWithScore) => __awaiter(void 0, void 0, void 0, function* () {
            const text = extractNodeText(nodeWithScore);
            const metadata = extractNodeMetadata(nodeWithScore);
            const rerankEmbedding = yield getCachedOrCreateEmbedding(embedModel.getTextEmbeddings.bind(embedModel), text);
            return {
                text,
                metadata,
                retrievalScore: typeof (nodeWithScore === null || nodeWithScore === void 0 ? void 0 : nodeWithScore.score) === "number" ? nodeWithScore.score : 0,
                rerankScore: cosineSimilarity(queryEmbedding, rerankEmbedding),
            };
        })));
        const grouped = new Map();
        for (const node of rerankedNodes) {
            const url = String(node.metadata.url || "");
            if (!url)
                continue;
            const freshnessScore = typeof node.metadata.freshnessScore === "number"
                ? node.metadata.freshnessScore
                : 0;
            const structuredScore = typeof node.metadata.structuredScore === "number"
                ? node.metadata.structuredScore
                : 0;
            const finalScore = node.rerankScore * 0.65 +
                node.retrievalScore * 0.2 +
                freshnessScore * 0.1 +
                structuredScore * 0.05;
            const nextSource = {
                id: 0,
                title: String(node.metadata.title || node.metadata.hostname || url),
                url,
                hostname: String(node.metadata.hostname || ""),
                snippet: String(node.metadata.snippet || ""),
                excerpt: node.text.slice(0, 900),
                score: Number(finalScore.toFixed(4)),
                retrievalScore: Number(node.retrievalScore.toFixed(4)),
                rerankScore: Number(node.rerankScore.toFixed(4)),
                freshnessScore,
                structuredScore,
                publishedAt: typeof node.metadata.publishedAt === "string"
                    ? node.metadata.publishedAt
                    : null,
                lastModified: typeof node.metadata.lastModified === "string"
                    ? node.metadata.lastModified
                    : null,
                cacheHit: Boolean(node.metadata.cacheHit),
            };
            const existing = grouped.get(url);
            if (!existing || nextSource.score > existing.score) {
                grouped.set(url, nextSource);
            }
        }
        return [...grouped.values()]
            .sort((left, right) => right.score - left.score)
            .slice(0, maxSourceCount)
            .map((source, index) => (Object.assign(Object.assign({}, source), { id: index + 1 })));
    }));
});
exports.retrieveAndRerank = retrieveAndRerank;
