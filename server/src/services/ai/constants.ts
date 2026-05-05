export const AI_PROVIDERS = {
  GEMINI: {
    id: "gemini",
    models: [
      "gemini-3.1-flash-lite-preview",
      "gemini-2.0-flash",
      "gemini-2.5-flash-lite",
    ],
    visionModels: [
      "gemini-2.0-flash",
      "gemini-3.1-flash-lite-preview"
    ]
  },
  NVIDIA: {
    id: "nvidia",
    models: [
      "nvidia/nemotron-3-super-120b-a12b",
      "moonshotai/kimi-k2-instruct",
      "openai/gpt-oss-120b",
      "black-forest-labs/flux.2-klein-4b"
    ],
    visionModels: [
       "black-forest-labs/flux.2-klein-4b" // For image gen, but could be extended
    ]
  },
} as const;

export const getDisplayProviderName = (
  providerId: string,
  modelName: string,
) => {
  const modelShortName = modelName.split("/").pop() || modelName;
  return `${providerId} : ${modelShortName}`;
};

/**
 * Helper to check if a model supports vision/multimedia input
 */
export const supportsVision = (modelId: string): boolean => {
  // Common keywords for vision models
  const visionKeywords = ['flash', 'vision', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5'];
  
  if (visionKeywords.some(kw => modelId.toLowerCase().includes(kw))) {
    return true;
  }

  // Explicit check against our config
  return Object.values(AI_PROVIDERS).some(p => 
    (p as any).visionModels?.includes(modelId)
  );
};
