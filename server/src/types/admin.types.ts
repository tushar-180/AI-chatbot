export interface ModelUsageItem {
  model: string;
  count: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
}

export interface UserAggregatedStats {
  favoriteModel: string;
  favoriteModelCount: number;
  modelUsage: ModelUsageItem[];
}
