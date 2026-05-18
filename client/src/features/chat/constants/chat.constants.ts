export const DEFAULT_CHAT_PROVIDER = "nvidia:openai/gpt-oss-120b";
export const CHAT_TITLE_MAX_LENGTH = 30;

/**
 * Helper to check if a model supports vision/multimedia input
 */
export const supportsVision = (modelId: string): boolean => {
  const mid = modelId.toLowerCase();
  
  // Explicitly check for models we know support vision
  const visionKeywords = [
    'flash',
    'vision',
    'gpt-4o',
    'sonnet',
    'opus',
    'gemini-1.5',
    'gemini-2.0',
    'gpt-5',
    'gpt-4.1',
    'o4-mini'
  ];
  
  return visionKeywords.some(kw => mid.includes(kw));
};
/**
 * Standardizes model names for display.
 * Handles formats like 'gemini:model-name', 'gemini : model-name', and raw model IDs.
 */
export const formatModelName = (model?: string): string => {
  if (!model) return "";
  
  // Normalize separators and trim
  const normalized = model.replace(/\s*[:/]\s*/g, " : ");
  const parts = normalized.split(" : ");
  
  // If we have provider:model, take the last part for a cleaner look or keep both
  // For now, let's keep both but ensure consistent spacing: "Provider : Model"
  if (parts.length > 1) {
    const provider = parts[0].toLowerCase();
    const modelName = parts[parts.length - 1];
    
    // Capitalize provider for better look
    const displayProvider = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    // If model name starts with provider, avoid redundancy
    if (modelName.toLowerCase().startsWith(provider)) {
      return `${displayProvider} : ${modelName.split('-').slice(1).join('-') || modelName}`;
    }
    
    return `${displayProvider} : ${modelName}`;
  }
  
  return model.charAt(0).toUpperCase() + model.slice(1);
};
