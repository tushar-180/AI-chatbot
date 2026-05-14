export { webSearchService } from "./webSearch.service";
export { estimateConfidence, withEstimatedConfidence } from "./confidence";
export {
    isLiveDataQuery,
    normalizeQuery,
    resolveSearchQuery,
} from "./queryResolver";
export {
    getExtractionCache,
    getGroundingCache,
    getSearchCache,
    setExtractionCache,
    setGroundingCache,
    setSearchCache,
} from "./cache";
export type {
    ConfidenceEstimate,
    ResolvedSearchQuery,
    SearchCandidate,
    SearchRejection,
    SearchSource,
    WebGroundingContext,
} from "./webSearch.types";
import { checkQuota, recordSearch } from "./rateLimiter";
