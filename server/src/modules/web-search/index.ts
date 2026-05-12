export { webSearchService } from "./webSearch.service";
export {
  estimateConfidence,
  withEstimatedConfidence,
} from "./confidence";
export { deduplicateCandidates } from "./deduplication";
export {
  isLiveDataQuery,
  normalizeQuery,
  resolveSearchQuery,
} from "./queryResolver";
export type {
  ConfidenceEstimate,
  ResolvedSearchQuery,
  SearchCandidate,
  SearchSource,
  WebGroundingContext,
} from "./webSearch.types";
