import { WebGroundingContext, SearchRejection } from "../modules/web-search";

export const buildGroundingMetadata = (
  webGrounding: WebGroundingContext | SearchRejection | null,
) => {
  if (!webGrounding || "rejected" in webGrounding) {
    return undefined;
  }

  return {
    grounded: true,
    query: webGrounding.query,
    resolvedQuery: webGrounding.resolvedQuery,
    normalizedQuery: webGrounding.normalizedQuery,
    liveDataQuery: webGrounding.liveDataQuery,
    confidence: webGrounding.confidence,
    debug: webGrounding.debug,
    sources: webGrounding.sources.map(
      ({ id, title, url, hostname, snippet }) => ({
        id,
        title,
        url,
        hostname,
        snippet,
      }),
    ),
  };
};

export const finalizeGroundedResponse = (
  response: string,
  webGrounding: WebGroundingContext | null,
) => {
  if (!webGrounding?.citationsMarkdown) {
    return { content: response, appendedCitations: "" };
  }

  // Prevent duplicate citations if model already hallucinated them
  const alreadyHasSources = webGrounding.sources.some((source) =>
    response.includes(source.url),
  );

  if (alreadyHasSources || /(^|\n)Sources:\s*$/im.test(response)) {
    return { content: response, appendedCitations: "" };
  }

  const appendedCitations = webGrounding.citationsMarkdown;
  return {
    content: `${response.trimEnd()}${appendedCitations}`,
    appendedCitations,
  };
};
