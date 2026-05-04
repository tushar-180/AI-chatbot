export const AI_PROVIDERS = {
  GEMINI: {
    id: "gemini",
    models: [
      "gemini-3.1-flash-lite-preview",
      "gemini-2.0-flash",
      "gemini-2.5-flash-lite",
    ],
  },
  NVIDIA: {
    id: "nvidia",
    models: [
      "nvidia/nemotron-3-super-120b-a12b",
      "moonshotai/kimi-k2-instruct",
      "openai/gpt-oss-120b"
    ],
  },
  CLAUDE: {
    id: "claude",
    models: [
      "claude-3-5-sonnet",
      "claude-3-opus",
      "claude-3-haiku",
    ],
  },
  OPENAI: {
    id: "openai",
    models: [
      "gpt-4o",
      "gpt-4-turbo",
      "gpt-3.5-turbo",
    ],
  },
} as const;

export const getDisplayProviderName = (
  providerId: string,
  modelName: string,
) => {
  const modelShortName = modelName.split("/").pop() || modelName;
  return `${providerId} : ${modelShortName}`;
};
