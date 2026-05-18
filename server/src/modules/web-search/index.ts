export { webSearchService } from "./webSearch.service";
export { estimateConfidence, withEstimatedConfidence } from "./confidence";
export {
    normalizeQuery,
    resolveSearchQuery,
} from "./queryResolver";
export {
    getGroundingCache,
    getSearchCache,
    setGroundingCache,
    setSearchCache,
    getLastSearchPointer,
    setLastSearchPointer,
} from "./cache";
export type {
    ConfidenceEstimate,
    ResolvedSearchQuery,
    SearchCandidate,
    SearchRejection,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";
