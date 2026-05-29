import fs from 'fs';
import path from 'path';
import type { LogTokenDetails, TokenUsage } from "../types/token.types";

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

/**
 * Logs token usage to the console and to a local log file (token_usage.log)
 */
export function logTokenUsage(details: LogTokenDetails): void {
  const timestamp = new Date().toISOString();
  
  const extras = [];
  if (details.username) extras.push(`User: ${details.username}`);
  if (details.chatTitle) extras.push(`Chat: ${details.chatTitle}`);
  if (details.groupTitle) extras.push(`Group: ${details.groupTitle}`);
  if (details.messageId) extras.push(`MsgID: ${details.messageId}`);
  if (details.hasWebSearch) extras.push(`WebSearch: YES`);
  if (details.mcpToolsProvided !== undefined) extras.push(`MCP_Tools: ${details.mcpToolsProvided}`);
  
  if (details.attachments && details.attachments.length > 0) {
    const attInfo = details.attachments.map(a => `${a.name || 'file'} (${a.mimeType || 'unknown'})`).join(', ');
    extras.push(`Attachments: [${attInfo}]`);
  }

  const extrasStr = extras.length > 0 ? ` | ${extras.join(' | ')}` : '';

  const logEntry = `[${timestamp}] [${details.context}] Model: ${details.model} | Prompt: ${details.usage.promptTokens} | Completion: ${details.usage.completionTokens} | Total: ${details.usage.totalTokens}${extrasStr}\n`;
  
  // Console log
  console.log(`📊 Token Usage -> ${logEntry.trim()}`);
  
  // File log
  try {
    const logFilePath = path.join(process.cwd(), 'token_usage.log');
    fs.appendFileSync(logFilePath, logEntry, 'utf8');
  } catch (error) {
    console.error("Failed to write token usage to log file:", error);
  }
}
