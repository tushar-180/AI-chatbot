export const DEFAULT_CHAT_PROVIDER = "nvidia:openai/gpt-oss-120b";
export const CHAT_TITLE_MAX_LENGTH = 30;

/**
 * Helper to check if a model supports vision/multimedia input
 */
export const supportsVision = (modelId: string): boolean => {
  const mid = modelId.toLowerCase();
  
  // Explicitly check for models we know support vision
  const visionKeywords = ['flash', 'vision', 'gpt-4o', 'sonnet', 'opus', 'gemini-1.5', 'gemini-2.0'];
  
  return visionKeywords.some(kw => mid.includes(kw));
};
