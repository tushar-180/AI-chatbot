export type SearchSource = {
  id: number;
  title: string;
  url: string;
  hostname: string;
  snippet: string;
  excerpt: string;
  score: number;
};

export type WebGroundingContext = {
  query: string;
  sources: SearchSource[];
  systemPrompt: string;
  citationsMarkdown: string;
  debug: {
    searchStrategy: "tavily";
    sourceStrategy: "page-extract" | "snippet-fallback";
    candidateCount: number;
    fetchedSourceCount: number;
  };
};

export type SearchCandidate = {
  title: string;
  url: string;
  hostname: string;
  snippet: string;
};
