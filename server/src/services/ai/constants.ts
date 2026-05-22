export const AI_PROVIDERS = {
  GEMINI: {
    id: "gemini",
    models: ["gemini-3.1-flash-lite-preview", "gemini-2.0-flash", "gemini-2.5-flash-lite"],
    visionModels: ["gemini-2.0-flash", "gemini-3.1-flash-lite-preview"],
  },
  OPENAI: {
    id: "openai",
    models: [
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.2",
      "gpt-5.4-mini",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "o3"
    ],
    visionModels: ["gpt-5", "gpt-5.4-mini"],
  },
  NVIDIA: {
    id: "nvidia",
    models: [
      "nvidia/nemotron-3-super-120b-a12b",
      "openai/gpt-oss-120b"
    ]
  },
} as const;

export const getDisplayProviderName = (providerId: string, modelName: string) => {
  const modelShortName = modelName.split("/").pop() || modelName;
  return `${providerId} : ${modelShortName}`;
};

/**
 * Helper to check if a model supports vision/multimedia input
 */
export const supportsVision = (modelId: string): boolean => {
  const mid = modelId.toLowerCase();
  
  // Extract model name in case it contains provider prefix (e.g., "openai:gpt-5-mini" -> "gpt-5-mini")
  const parts = mid.split(":");
  const modelName = parts.length > 1 ? parts[1].trim() : parts[0].trim();

  // Common keywords for vision models
  const visionKeywords = ["flash", "vision", "gpt-4o", "claude-3-5-sonnet", "gemini-1.5"];

  if (visionKeywords.some((kw) => modelName.includes(kw))) {
    return true;
  }

  // Explicit check against our config
  return Object.values(AI_PROVIDERS).some((p) =>
    (p as any).visionModels?.some((vm: string) => vm.toLowerCase() === modelName)
  );
};
