export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function createTokenUsage(
  promptTokens = 0,
  completionTokens = 0,
  totalTokens?: number,
): TokenUsage {
  const normalizedPromptTokens = Number(promptTokens) || 0;
  const normalizedCompletionTokens = Number(completionTokens) || 0;
  const normalizedTotalTokens =
    Number(totalTokens) || normalizedPromptTokens + normalizedCompletionTokens;

  return {
    promptTokens: normalizedPromptTokens,
    completionTokens: normalizedCompletionTokens,
    totalTokens: normalizedTotalTokens,
  };
}

export function normalizeOpenAIUsage(usage: any): TokenUsage | undefined {
  if (!usage) return undefined;

  // OpenAI Chat Completions API: prompt_tokens / completion_tokens
  // OpenAI Responses API: input_tokens / output_tokens
  // Nvidia NIM: may use either format, or only provide total_tokens
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens;
  const totalTokens = usage.total_tokens;

  // Guard: at least one field must be a number
  if (
    typeof promptTokens !== "number" &&
    typeof completionTokens !== "number" &&
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return createTokenUsage(promptTokens, completionTokens, totalTokens);
}

export function normalizeGeminiUsageMetadata(
  usageMetadata: any,
): TokenUsage | undefined {
  if (!usageMetadata) return undefined;

  const promptTokens =
    usageMetadata.promptTokenCount ?? usageMetadata.prompt_token_count;
  const completionTokens =
    usageMetadata.candidatesTokenCount ??
    usageMetadata.candidates_token_count;
  const totalTokens =
    usageMetadata.totalTokenCount ?? usageMetadata.total_token_count;

  if (
    typeof promptTokens !== "number" &&
    typeof completionTokens !== "number" &&
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return createTokenUsage(promptTokens, completionTokens, totalTokens);
}

/**
 * Estimate token count based on standard English ratio (1 token ≈ 4 characters).
 * Accounts for vision attachments by adding a fixed token cost (258 tokens per attachment).
 */
export function estimateTokenCount(text: string, attachmentCount = 0): number {
  const textTokens = text ? Math.ceil(text.length / 4) : 0;
  const attachmentTokens = attachmentCount * 258;
  return textTokens + attachmentTokens;
}

/**
 * Calculate token usage for a conversation turn.
 * @param promptText The full input prompt context
 * @param completionText The model's response
 * @param promptAttachmentCount Total attachments in the prompt context
 * @param completionAttachmentCount Total attachments in the completion response (usually 0)
 */
export function calculateUsage(
  promptText: string,
  completionText: string,
  promptAttachmentCount = 0,
  completionAttachmentCount = 0
): TokenUsage {
  const promptTokens = estimateTokenCount(promptText, promptAttachmentCount);
  const completionTokens = estimateTokenCount(completionText, completionAttachmentCount);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

/**
 * Serialize a message list to text for prompt token estimation.
 */
export function serializePromptMessages(messages: any[]): string {
  if (!messages || !Array.isArray(messages)) return "";
  return messages
    .map((m) => {
      const role = m.role || "user";
      const content = m.content || "";
      return `${role}: ${content}`;
    })
    .join("\n");
}
