export interface ActiveGroupStream {
  groupId: string;
  tempId: string;
  assistantUsername: string;
  fullResponse: string;
  webSearchEnabled: boolean;
  model: string;
  requesterId?: string;
  abortController: AbortController;
  promptMessages?: any[];
  targetProvider?: string;
  clerkId?: string;
}
