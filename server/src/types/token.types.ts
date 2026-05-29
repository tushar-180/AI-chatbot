export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LogTokenDetails {
  model: string;
  usage: TokenUsage;
  context: string;
  username?: string;
  groupTitle?: string;
  chatTitle?: string;
  messageId?: string;
  hasWebSearch?: boolean;
  mcpToolsProvided?: number;
  attachments?: { name?: string; mimeType?: string }[];
}
