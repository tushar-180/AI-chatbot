import { aiService } from "../../services/ai.service";
import { getEmbeddingCache, setEmbeddingCache } from "./cache";
import type { ExtractedPage } from "./cache";
import type { SearchSource } from "./webSearch.types";

const EMBEDDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SIMILARITY_TOP_K = 8;

type LlamaIndexModule = {
  Document: new (input: Record<string, unknown>) => any;
  SentenceSplitter: new (input?: Record<string, unknown>) => {
    splitText: (text: string) => string[];
  };
  Settings: {
    withEmbedModel: <T>(model: unknown, fn: () => Promise<T>) => Promise<T>;
  };
  VectorStoreIndex: {
    fromDocuments: (documents: any[]) => Promise<{
      asRetriever: (options?: Record<string, unknown>) => {
        retrieve: (params: { query: string }) => Promise<any[]>;
      };
    }>;
  };
};

class ServiceEmbedding {
  constructor(private providerName?: string) {}

  async getTextEmbedding(text: string): Promise<number[]> {
    const provider = aiService.getProvider(this.providerName);
    return provider.generateEmbedding(text);
  }

  async getTextEmbeddings(texts: string[]): Promise<number[][]> {
    const provider = aiService.getProvider(this.providerName);
    return Promise.all(texts.map((text) => provider.generateEmbedding(text)));
  }

  async getQueryEmbedding(query: string): Promise<number[]> {
    return this.getTextEmbedding(query);
  }
}

const loadLlamaIndexRuntime = async (): Promise<{
  llamaindex: LlamaIndexModule;
}> => {
  const llamaindexModuleName = "llamaindex";

  try {
    const llamaindex = await import(llamaindexModuleName);

    return {
      llamaindex: llamaindex as unknown as LlamaIndexModule,
    };
  } catch (error) {
    throw new Error(
      `LlamaIndex runtime is not available. Install "llamaindex". ${String(
        error,
      )}`,
    );
  }
};

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

const extractNodeText = (node: any) =>
  String(
    node?.text ??
      node?.node?.text ??
      node?.node?.getContent?.() ??
      node?.getContent?.() ??
      "",
  ).trim();

const extractNodeMetadata = (node: any) =>
  ((node?.metadata || node?.node?.metadata || {}) as Record<string, unknown>) ||
  {};

const getCachedOrCreateEmbedding = async (
  embedMany: (texts: string[]) => Promise<number[][]>,
  text: string,
) => {
  const cached = getEmbeddingCache(text);
  if (cached) return cached;

  const [embedding] = await embedMany([text]);
  setEmbeddingCache(text, embedding, EMBEDDING_CACHE_TTL_MS);
  return embedding;
};

export const createSemanticEmbedder = async (providerName?: string) => {
  const embedModel = new ServiceEmbedding(providerName);

  return {
    embedTexts: async (texts: string[]) => {
      const pending: string[] = [];
      const pendingIndexes: number[] = [];
      const result: number[][] = new Array(texts.length);

      texts.forEach((text, index) => {
        const cached = getEmbeddingCache(text);
        if (cached) {
          result[index] = cached;
          return;
        }
        pending.push(text);
        pendingIndexes.push(index);
      });

      if (pending.length) {
        const embeddings = await embedModel.getTextEmbeddings(pending);
        embeddings.forEach((embedding, index) => {
          const targetIndex = pendingIndexes[index];
          result[targetIndex] = embedding;
          setEmbeddingCache(pending[index], embedding, EMBEDDING_CACHE_TTL_MS);
        });
      }

      return result;
    },
  };
};

export const retrieveAndRerank = async (params: {
  query: string;
  pages: Array<
    ExtractedPage & { freshnessScore?: number; structuredScore?: number }
  >;
  maxSourceCount: number;
  providerName?: string;
}) => {
  const { query, pages, maxSourceCount, providerName } = params;
  const { llamaindex } = await loadLlamaIndexRuntime();

  const embedModel = new ServiceEmbedding(providerName);

  const splitter = new llamaindex.SentenceSplitter({
    chunkSize: 768,
    chunkOverlap: 120,
  });

  const chunkDocuments = pages.flatMap((page, pageIndex) => {
    const chunks = splitter.splitText(page.text).filter(Boolean);
    const chunkList = chunks.length ? chunks : [page.text];

    return chunkList.map(
      (chunk, chunkIndex) =>
        new llamaindex.Document({
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
        }),
    );
  });

  if (!chunkDocuments.length) return [];

  return llamaindex.Settings.withEmbedModel(embedModel, async () => {
    const index = await llamaindex.VectorStoreIndex.fromDocuments(chunkDocuments);
    const retriever = index.asRetriever({
      similarityTopK: Math.max(DEFAULT_SIMILARITY_TOP_K, maxSourceCount * 2),
    });
    const retrievedNodes = await retriever.retrieve({ query });

    const queryEmbedding = await getCachedOrCreateEmbedding(
      embedModel.getTextEmbeddings.bind(embedModel),
      query,
    );

    const rerankedNodes = await Promise.all(
      retrievedNodes.map(async (nodeWithScore) => {
        const text = extractNodeText(nodeWithScore);
        const metadata = extractNodeMetadata(nodeWithScore);
        const rerankEmbedding = await getCachedOrCreateEmbedding(
          embedModel.getTextEmbeddings.bind(embedModel),
          text,
        );

        return {
          text,
          metadata,
          retrievalScore:
            typeof nodeWithScore?.score === "number" ? nodeWithScore.score : 0,
          rerankScore: cosineSimilarity(queryEmbedding, rerankEmbedding),
        };
      }),
    );

    const grouped = new Map<string, SearchSource>();

    for (const node of rerankedNodes) {
      const url = String(node.metadata.url || "");
      if (!url) continue;

      const freshnessScore =
        typeof node.metadata.freshnessScore === "number"
          ? node.metadata.freshnessScore
          : 0;
      const structuredScore =
        typeof node.metadata.structuredScore === "number"
          ? node.metadata.structuredScore
          : 0;
      const finalScore =
        node.rerankScore * 0.65 +
        node.retrievalScore * 0.2 +
        freshnessScore * 0.1 +
        structuredScore * 0.05;

      const nextSource: SearchSource = {
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
        publishedAt:
          typeof node.metadata.publishedAt === "string"
            ? node.metadata.publishedAt
            : null,
        lastModified:
          typeof node.metadata.lastModified === "string"
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
      .map((source, index) => ({ ...source, id: index + 1 }));
  });
};
