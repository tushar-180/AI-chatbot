export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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
