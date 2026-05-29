import { ChatMessage } from "../../types/chat.types";
import { getLimitedMessages } from "../../utils/chatHistory";
import { retrieveFileContext } from "../../modules/file-rag/fileRetrieval";
import { userService } from "../user/user.service";
import { memoryService } from "../memory/memory.service";
import { webSearchService } from "../../modules/web-search";
import { extractTranscript } from "../../modules/tools/youtube";
import { BASE_SYSTEM_PROMPT } from "../../constants/prompt.constants";
import { buildProjectContext } from "../project/buildProjectContext";

export const CONTEXT_SIZE_LIMITS = {
  gemini: 500000,
  default: 100000,
};

const EXTERNAL_CALL_TIMEOUT_MS = 10000; // 10 seconds per call

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export async function fetchYoutubeTranscript(effectiveLatestUserMessage: string, sizeLimit: number): Promise<string | null> {
  if (!effectiveLatestUserMessage) return null;
  const youtubeRegex =
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?.*?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = effectiveLatestUserMessage.match(youtubeRegex);
  if (!match) return null;
  const result = await withTimeout(
    extractTranscript({ videoIdOrUrl: match[1], maxLength: sizeLimit }),
    EXTERNAL_CALL_TIMEOUT_MS,
  );
  return result?.success ? result.text : null;
}

export async function fetchWebGroundingContext(
  webSearchEnabled: boolean,
  effectiveLatestUserMessage: string,
  chatMessages: ChatMessage[],
  userId: string,
  isGemini: boolean,
): Promise<any | null> {
  if (!webSearchEnabled) {
    return null;
  }
  const result = await withTimeout(
    webSearchService.buildGroundingContext(
      effectiveLatestUserMessage,
      chatMessages,
      userId,
      isGemini,
    ),
    30000,
  );
  return result && !("rejected" in result) ? result : null;
}

export const buildPromptMessages = async (
  userId: string,
  chatMessages: ChatMessage[],
  latestUserMessage?: string,
  webSearchEnabled = false,
  provider?: string,
  projectId?: string,
  currentChatId?: string,
) => {
  if (projectId) {
    return await buildProjectContext(
      userId,
      projectId,
      chatMessages,
      latestUserMessage,
      webSearchEnabled,
      provider,
      currentChatId,
    );
  }
  const isGemini = provider?.startsWith("gemini") ?? false;
  const sizeLimit = isGemini
    ? CONTEXT_SIZE_LIMITS.gemini
    : CONTEXT_SIZE_LIMITS.default;

  // 1. Get limited messages and handle selection context
  const rawPromptMessages = getLimitedMessages(chatMessages);
  const lastUserMsg = [...rawPromptMessages]
    .reverse()
    .find((m) => m.role === "user");

  let fileContext: string | null = null;

  const recentMessages = chatMessages.slice(-10);
  const userMessagesWithFilesAll = recentMessages
    .filter((m) => m.role === "user" && m.attachments && m.attachments.length > 0)
    .slice(-1); // take the most recent one across the last 10 messages

  if (userMessagesWithFilesAll.length > 0) {
    const lastFileMsg = userMessagesWithFilesAll[0];
    const firstAtt = lastFileMsg.attachments?.[0];

    if (firstAtt && firstAtt.mimeType && !firstAtt.mimeType.startsWith("image/")) {
      const storagePath = firstAtt.storagePath;
      if (storagePath) {
        const context = await retrieveFileContext(rawPromptMessages, storagePath);
        if (context) {
          fileContext = context;
        }
      }
    }

    // Check if the message with the attachment fell out of the sliding window
    const isFileInContext = rawPromptMessages.some((m) =>
      (m.id && m.id === lastFileMsg.id) ||
      (m as any)._id?.toString() === (lastFileMsg as any)._id?.toString()
    );

    if (!isFileInContext && lastFileMsg.attachments) {
      // Re-inject the attachments into the oldest user message in the current window so the LLM doesn't forget them
      const firstUserMsgInContext = rawPromptMessages.find((m) => m.role === "user");
      if (firstUserMsgInContext) {
        firstUserMsgInContext.attachments = [
          ...(firstUserMsgInContext.attachments || []),
          ...lastFileMsg.attachments
        ];
      }
    }
  }

  // Apply selection logic from staging (if present)
  if (lastUserMsg?.metadata?.selection) {
    const selection = lastUserMsg.metadata.selection as any;
    const userRequest = lastUserMsg.content?.trim() || "Explain this.";
    lastUserMsg.content = `User selected text from a previous assistant message.

Selected text:
"${selection.selectedText}"

Original message:
"${selection.originalSourceMessage}"

User request:
${userRequest}`;
  }

  // 2. Determine effective latest user message for external calls
  const effectiveLatestUserMessage =
    latestUserMessage ?? lastUserMsg?.content ?? "";

  // 3. Parallel external calls with timeouts
  const [
    personalizationResult,
    memoryResult,
    youtubeResult,
    webGroundingResult,
  ] = await Promise.allSettled([
    withTimeout(
      userService.getPersonalizationContext(userId),
      EXTERNAL_CALL_TIMEOUT_MS,
    ),
    withTimeout(
      memoryService.getMemoryContext(userId, effectiveLatestUserMessage),
      EXTERNAL_CALL_TIMEOUT_MS,
    ),
    fetchYoutubeTranscript(effectiveLatestUserMessage, sizeLimit),
    fetchWebGroundingContext(webSearchEnabled, effectiveLatestUserMessage, chatMessages, userId, isGemini)
  ]);

  // Extract values (null on failure)
  const personalizationContext =
    personalizationResult.status === "fulfilled"
      ? personalizationResult.value
      : null;
  const memoryContext =
    memoryResult.status === "fulfilled" ? memoryResult.value : null;
  const youtubeTranscriptContent =
    youtubeResult.status === "fulfilled" ? youtubeResult.value : null;
  const webGrounding =
    webGroundingResult.status === "fulfilled" ? webGroundingResult.value : null;

  // 4. Build sorted system messages
  const systemMessageSources = [
    { content: BASE_SYSTEM_PROMPT, priority: 0 },
    { content: personalizationContext, priority: 10 },
    { content: memoryContext, priority: 20 },
    {
      content: youtubeTranscriptContent
        ? `The user provided a YouTube video. Here is its transcript (use it to answer questions about the video):\n\n${youtubeTranscriptContent}`
        : null,
      priority: 30,
    },
    {
      content: fileContext
        ? `The user provided a file. Use its content to answer any questions. The file text:\n\n${fileContext}`
        : null,
      priority: 30,
    },
    { content: webGrounding?.systemPrompt ?? null, priority: 40 },
  ];

  const systemMessages: ChatMessage[] = systemMessageSources
    .filter((s) => s.content !== null)
    .sort((a, b) => a.priority - b.priority)
    .map(({ content }) => ({
      role: "system",
      content: content!,
      userId,
      status: "completed",
      attachments: [],
      type: "text",
    }));

  const finalPromptMessages = [...systemMessages, ...rawPromptMessages];

  return {
    promptMessages: finalPromptMessages,
    webGrounding,
  };
};

export const buildTemporaryPromptMessages = async (
  userId: string,
  chatMessages: ChatMessage[],
  latestUserMessage?: string,
  webSearchEnabled = false,
  provider?: string,
) => {
  const promptMessages = getLimitedMessages(chatMessages);
  const systemMessages: ChatMessage[] = [
    {
      role: "system",
      content: BASE_SYSTEM_PROMPT,
      userId,
      status: "completed",
    },
  ];

  let fileContext: string | null = null;
  const userMessagesWithFiles = promptMessages
    .filter((m) => m.role === "user" && m.attachments?.some((a) => a.storagePath))
    .slice(-1);

  if (userMessagesWithFiles.length > 0) {
    const lastFileMsg = userMessagesWithFiles[0];
    const storagePath = lastFileMsg.attachments?.find((a) => a.storagePath)?.storagePath;
    if (storagePath) {
      const context = await retrieveFileContext(promptMessages, storagePath);
      if (context) {
        fileContext = context;
      }
    }
  }

  if (fileContext) {
    systemMessages.push({
      role: "system",
      content: `The user provided a file. Use its content to answer any questions. The file text:\n\n${fileContext}`,
      userId,
      status: "completed",
    });
  }

  let webGrounding: any = null;
  const supportsImages = provider?.startsWith("gemini");
  if (webSearchEnabled && latestUserMessage) {
    const result = await webSearchService.buildGroundingContext(
      latestUserMessage,
      chatMessages,
      userId,
      supportsImages || false,
    );

    if (result && "rejected" in result) {
      console.warn(`[temporary chat] Web search rejected: ${result.reason} — ${result.message}`);
    } else {
      webGrounding = result;
    }
  }

  if (webGrounding) {
    systemMessages.push({
      role: "system",
      content: webGrounding.systemPrompt,
      userId,
      status: "completed",
    });
  }

  return {
    promptMessages: [...systemMessages, ...promptMessages],
    webGrounding,
  };
};
