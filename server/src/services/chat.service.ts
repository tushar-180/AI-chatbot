import {
  CHAT_TITLE_MAX_LENGTH,
  DEFAULT_AI_PROVIDER,
  DEFAULT_CHAT_TITLE,
} from "../constants/chat.constants";
import { BASE_SYSTEM_PROMPT } from "../constants/prompt.constants";
import { chatRepository } from "../repositories/chat.repository";
import type {
  Attachment,
  ChatMessage,
  CreateChatInput,
  SendMessageInput,
  EditMessageInput,
  StopStreamInput,
  StreamPayload,
} from "../types/chat.types";
import { getLimitedMessages, parseMultimedia } from "../utils/chatHistory";
import {
  type WebGroundingContext,
  type SearchRejection,
  webSearchService,
} from "../modules/web-search";
import { aiService } from "./ai.service";
import { chatStreamRegistry } from "./chatStreamRegistry.service";
import { memoryService } from "./memory.service";
import { userService } from "./user.service";
import { mcpClientService } from "./mcpClient.service";
import {
  TokenUsage,
  calculateUsage,
  estimateTokenCount,
  serializePromptMessages,
  logTokenUsage,
} from "../utils/tokenCounter";
import { buildProjectContext } from "./buildProjectContext";

import { parseFile } from "../modules/file-rag/fileParser";
import { processAttachedFile, cleanupChatFiles } from "../modules/file-rag/fileHandler";
import { retrieveFileContext } from "../modules/file-rag/fileRetrieval";
import { extractTranscript } from "../modules/tools/youtube";
import {
  nextVersionForParent,
  resolveActiveBranch,
  getContextBeforeMessage,
  type RawMessage,
} from "../utils/branchUtils";


const getChatId = (chat: { _id: unknown }) => String(chat._id);

const createUserMessage = (
  content: string,
  userId: string,
  provider?: string,
  attachments?: Attachment[],
): ChatMessage => ({
  role: "user",
  userId,
  content,
  model: provider || DEFAULT_AI_PROVIDER,
  status: "completed",
  attachments: attachments || [],
  type: attachments && attachments.length > 0 ? "image" : "text",
});

const createAssistantMessage = (
  content: string,
  userId: string,
  model: string,
  requestId?: string,
  status: ChatMessage["status"] = "completed",
  metadata?: Record<string, unknown>,
): ChatMessage => ({
  role: "assistant",
  userId,
  content,
  model,
  requestId,
  status,
  metadata,
});

const createTitle = (message?: string) => {
  return message ? message.slice(0, CHAT_TITLE_MAX_LENGTH) : DEFAULT_CHAT_TITLE;
};

const requireUserId = (userId?: string) => {
  if (!userId) {
    const error = new Error("userId is required");
    error.name = "ValidationError";
    throw error;
  }

  return userId;
};

const requireMessage = (
  message?: string,
  messageText = "message is required",
) => {
  const trimmedMessage = message?.trim();

  if (!trimmedMessage) {
    const error = new Error(messageText);
    error.name = "ValidationError";
    throw error;
  }

  return trimmedMessage;
};

const requireRequestId = (requestId?: string) => {
  if (!requestId) {
    const error = new Error("requestId is required");
    error.name = "ValidationError";
    throw error;
  }

  return requestId;
};

const requireChat = async (chatId: string) => {
  const chat = await chatRepository.findById(chatId);

  if (!chat) {
    const error = new Error("Chat not found");
    error.name = "NotFoundError";
    throw error;
  }

  return chat;
};

const getAssistantMessageByRequestId = (
  chat: Awaited<ReturnType<typeof requireChat>>,
  requestId: string,
) =>
  (chat.messages as ChatMessage[]).find(
    (message) =>
      message.role === "assistant" && message.requestId === requestId,
  );

const buildGroundingMetadata = (
  webGrounding: WebGroundingContext | SearchRejection | null,
) => {
  if (!webGrounding || "rejected" in webGrounding) {
    return undefined;
  }

  return {
    grounded: true,
    query: webGrounding.query,
    resolvedQuery: webGrounding.resolvedQuery,
    normalizedQuery: webGrounding.normalizedQuery,
    liveDataQuery: webGrounding.liveDataQuery,
    confidence: webGrounding.confidence,
    debug: webGrounding.debug,
    sources: webGrounding.sources.map(
      ({ id, title, url, hostname, snippet }) => ({
        id,
        title,
        url,
        hostname,
        snippet,
      }),
    ),
  };
};

const finalizeGroundedResponse = (
  response: string,
  webGrounding: WebGroundingContext | null,
) => {
  if (!webGrounding?.citationsMarkdown) {
    return { content: response, appendedCitations: "" };
  }

  const appendedCitations = webGrounding.citationsMarkdown;
  return {
    content: `${response.trimEnd()}${appendedCitations}`,
    appendedCitations,
  };
};

const resolveAssistantTokens = (
  usage: TokenUsage | undefined,
  promptText: string,
  completionText: string,
  promptAttachmentCount = 0,
) => usage ?? calculateUsage(promptText, completionText, promptAttachmentCount);

const CONTEXT_SIZE_LIMITS = {
  gemini: 500000,
  default: 100000,
};

const EXTERNAL_CALL_TIMEOUT_MS = 10000; // 10 seconds per call

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

const getEnabledMcpTools = async (userId: string, hasFiles: boolean = true, latestMessageText: string = "") => {
  const user = await userService.getUserByClerkId(userId);
  const disabledMcpServers = (user?.get("disabledMcpServers") || []) as string[];
  const allTools = await mcpClientService.getActiveTools();

  const lowerMessage = latestMessageText.toLowerCase();

  // 1. Dynamic keywords from active tools (Future-proofing for new MCPs)
  // Extracts words like 'spotify' from 'spotify-mcp-server' or 'create_playlist'
  const dynamicKeywords = new Set<string>();
  allTools.forEach(tool => {
      const sNameParts = (tool._serverName || "").toLowerCase().split(/[-_]/);
      const tNameParts = (tool.name || "").toLowerCase().split(/[-_]/);
      [...sNameParts, ...tNameParts].forEach(part => {
          if (part.length > 3 && !['server', 'mcp', 'tool', 'api'].includes(part)) {
              dynamicKeywords.add(part);
          }
      });
  });

  const hasDynamicIntent = Array.from(dynamicKeywords).some(kw => lowerMessage.includes(kw));
  
  // 2. Categorized intent keywords
  const categories = {
    weather: ['weather', 'forecast', 'temperature', 'rain', 'climate', 'sun', 'cloud', 'humidity', 'wind'],
    github: ['github', 'git', 'repo', 'pr', 'commit', 'issue', 'pull request', 'repository'],
    database: ['db', 'database', 'query', 'sql', 'mysql', 'postgres', 'sqlite', 'table', 'record', 'row'],
    web: ['search', 'web', 'google', 'find', 'lookup', 'browse', 'research', 'current', 'latest', 'today', 'now'],
    memory: ['remember', 'memory', 'forget', 'recall'],
    general: [
      'mcp',
      'tool',
      'run',
      'execute',
      'fetch',
      'use the tool',
      'use tools',
      'check',
      'verify',
      'inspect',
      'analyze',
      'compare',
      'details',
      'information',
      'info',
      'status',
      'read',
      'open',
      'list',
      'show me',
      'give me',
      'look up',
      'retrieve',
    ]
  };

  const triggeredCategories = new Set<string>();
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lowerMessage.includes(kw))) {
      triggeredCategories.add(category);
    }
  }

  const hasToolIntent = triggeredCategories.size > 0 || hasDynamicIntent;

  // If no files are attached AND no tool keywords are present, pass ZERO tools
  if (!hasFiles && !hasToolIntent) {
    return [];
  }

  return allTools.filter((tool) => {
    if (disabledMcpServers.includes(tool._serverName)) return false;

    const toolName = tool.name.toLowerCase();
    const serverName = (tool._serverName || "").toLowerCase();
    
    const isFileTool = 
        toolName.includes("excel") || serverName.includes("excel") ||
        toolName.includes("csv") || serverName.includes("csv") ||
        toolName.includes("pdf") || serverName.includes("pdf") ||
        toolName.includes("file") || serverName.includes("file") ||
        toolName.includes("document") || serverName.includes("document");

    if (hasFiles && !hasToolIntent) return isFileTool;
    if (!hasFiles && isFileTool) return false;

    // If 'general' keywords used, allow all non-file tools
    if (triggeredCategories.has('general')) return true;

    // Check if THIS tool has a dynamic match
    const sNameParts = serverName.split(/[-_]/);
    const tNameParts = toolName.split(/[-_]/);
    const thisToolHasDynamicMatch = [...sNameParts, ...tNameParts].some(part => 
      part.length > 3 && !['server', 'mcp', 'tool', 'api'].includes(part) && lowerMessage.includes(part)
    );

    if (thisToolHasDynamicMatch) return true;

    // Categorize the tool itself
    let toolCategory = "other";
    if (toolName.includes("weather") || serverName.includes("weather") || toolName.includes("forecast")) toolCategory = "weather";
    else if (toolName.includes("github") || serverName.includes("github") || toolName.includes("git")) toolCategory = "github";
    else if (toolName.includes("sql") || serverName.includes("sql") || toolName.includes("db") || serverName.includes("postgres") || serverName.includes("mysql") || serverName.includes("sqlite")) toolCategory = "database";
    else if (toolName.includes("search") || serverName.includes("search") || toolName.includes("web") || toolName.includes("google") || toolName.includes("tavily") || serverName.includes("brave")) toolCategory = "web";
    else if (toolName.includes("memory") || serverName.includes("memory")) toolCategory = "memory";

    // If the tool is categorized but its category wasn't triggered, EXCLUDE IT
    if (toolCategory !== "other" && !triggeredCategories.has(toolCategory)) {
        return false;
    }

    return true;
  });
};

async function fetchYoutubeTranscript(effectiveLatestUserMessage: string, sizeLimit: number): Promise<string | null> {
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

async function fetchWebGroundingContext(
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

const buildPromptMessages = async (
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

async function* streamAssistantResponse(
  chat: Awaited<ReturnType<typeof requireChat>>,
  requestId: string,
  provider?: string,
  includeChatId = false,
  existingAssistantMessageId?: string,
  webSearchOverride?: boolean,
  // Branch metadata: when set, a NEW message node is created (immutable retry/edit)
  branchMeta?: {
    parentId?: string;
    retryOf?: string;
    editedFrom?: string;
    branchId?: string;
    version?: number;
  },
): AsyncGenerator<StreamPayload> {
  await aiService.validateModelAccess(provider);
  const aiProvider = aiService.getProvider(provider);
  const providerName = aiProvider.getProviderName();
  const chatId = getChatId(chat);

  // If retrying, we filter out the message being retried from the prompt context
  const messagesForPrompt = existingAssistantMessageId
    ? (chat.messages as ChatMessage[]).filter(
      (m) => (m as any).id !== existingAssistantMessageId,
    )
    : (chat.messages as ChatMessage[]);

  const lastUserMessage = messagesForPrompt
    .filter((m) => m.role === "user")
    .pop();

  const isWebSearchEnabled = webSearchOverride !== undefined 
    ? webSearchOverride 
    : Boolean(lastUserMessage?.metadata?.webSearchEnabled);

  const { promptMessages, webGrounding } = await buildPromptMessages(
    String(chat.userId),
    messagesForPrompt,
    lastUserMessage?.content,
    isWebSearchEnabled,
    provider,
    chat.projectId ? String(chat.projectId) : undefined,
    chatId,
  );

  let assistantMessageDoc;
  if (existingAssistantMessageId) {
    assistantMessageDoc = await chatRepository.updateMessage(
      existingAssistantMessageId,
      {
        content: "",
        status: "streaming",
        requestId,
        model: providerName,
        metadata: buildGroundingMetadata(webGrounding),
      },
    );
  } else {
    // Create assistant message in its own collection.
    // If branchMeta is provided this is an immutable retry/edit node.
    assistantMessageDoc = await chatRepository.saveMessage(chatId, {
      role: "assistant",
      userId: chat.userId,
      content: "",
      model: providerName,
      requestId,
      status: "streaming",
      metadata: buildGroundingMetadata(webGrounding),
      ...(branchMeta ? {
        parentId: branchMeta.parentId,
        retryOf: branchMeta.retryOf,
        editedFrom: branchMeta.editedFrom,
        branchId: branchMeta.branchId,
        version: branchMeta.version ?? 1,
        isActive: true,
      } : {}),
    } as any);
  }

  const messageId = (assistantMessageDoc as any)._id?.toString() || "";
  const activeStream = chatStreamRegistry.create({
    requestId,
    chatId,
    messageId,
    model: providerName,
  });

  if (activeStream.status === "stopped") {
    await chatRepository.updateMessage(messageId, {
      status: "stopped",
    });
    yield (
      includeChatId
        ? {
          chatId,
          messageId,
          requestId,
          model: providerName,
          status: "stopped",
          done: true,
        }
        : { messageId, requestId, model: providerName, status: "stopped", done: true }
    ) as StreamPayload;
    return;
  }

  yield (
    includeChatId
      ? {
        chatId,
        messageId,
        requestId,
        model: providerName,
        status: "streaming",
      }
      : { messageId, requestId, model: providerName, status: "streaming" }
  ) as StreamPayload;

  if (
    webGrounding &&
    !("rejected" in webGrounding) &&
    webGrounding.sources.length > 0
  ) {
    yield {
      type: "sources",
      sources: webGrounding.sources.map((s: any) => ({
        id: s.id,
        url: s.url,
        title: s.title,
        hostname: s.hostname,
        snippet: s.snippet,
      })),
      requestId,
    } as StreamPayload;
  }

  let fullResponse = "";
  let receivedFirstChunk = false;
  let firstTokenTimedOut = false;

  try {
    const hasFiles = promptMessages.some((m) =>
      m.attachments?.some((a: any) => a.mimeType && !a.mimeType.startsWith("image/"))
    );
    const latestUserMsgText = promptMessages.filter(m => m.role === 'user').pop()?.content || "";
    const tools = isWebSearchEnabled 
      ? [] 
      : await getEnabledMcpTools(String(chat.userId), hasFiles, latestUserMsgText);
    console.log("toools", tools)
  
    const promptSizes = promptMessages.map(m => ({
      role: m.role,
      length: m.content?.length || 0,
    }));
    const stream = await aiProvider.generateStreamResponse(
      promptMessages,
      activeStream.abortController.signal,
      tools,
    );
    const timeout = setTimeout(() => {
      if (!receivedFirstChunk) {
        console.error(`AI generation timed out for requestId: ${requestId}`);
        firstTokenTimedOut = true;
        activeStream.abortController.abort();
      }
    }, 50000);

    try {
      for await (const chunk of stream) {
        if (activeStream.abortController.signal.aborted) {
          break;
        }

        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          firstTokenTimedOut = false;
          clearTimeout(timeout);
          chatRepository.update(chatId, { isSidebarVisible: true }).catch((err) => {
            console.error("Failed to make chat sidebar visible on first chunk:", err);
          });
        }

        fullResponse += chunk;
        chatStreamRegistry.updateResponse(requestId, fullResponse, chunk);
        yield { chunk, requestId, status: "streaming" };
      }
    } finally {
      clearTimeout(timeout);
    }

    chatStreamRegistry.updateUsage(requestId, await stream.usage);

    if (!fullResponse.trim() && !activeStream.abortController.signal.aborted) {
      fullResponse = "The AI was unable to generate a response. Please try rephrasing your request or check if it was blocked by safety filters.";
      chatStreamRegistry.updateResponse(requestId, fullResponse, fullResponse);
      yield { chunk: fullResponse, requestId, status: "streaming" };
    }

    const groundedResponse = finalizeGroundedResponse(
      fullResponse,
      webGrounding,
    );
    if (
      groundedResponse.appendedCitations &&
      !activeStream.abortController.signal.aborted
    ) {
      fullResponse = groundedResponse.content;
      chatStreamRegistry.updateResponse(
        requestId,
        fullResponse,
        groundedResponse.appendedCitations,
      );
      yield {
        chunk: groundedResponse.appendedCitations,
        requestId,
        status: "streaming",
      };
    }

    const finalStatus = activeStream.abortController.signal.aborted
      ? "stopped"
      : "completed";

    const promptText = serializePromptMessages(promptMessages);
    const promptAttachmentCount = promptMessages.reduce(
      (sum, m) => sum + (m.attachments?.length || 0),
      0,
    );
    const tokens = resolveAssistantTokens(
      activeStream.usage,
      promptText,
      fullResponse,
      promptAttachmentCount,
    );

    // Update message doc in collection
    await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
      content: fullResponse,
      status: finalStatus,
      model: providerName,
      attachments: [],
      type: "text",
      metadata: buildGroundingMetadata(webGrounding),
      tokens,
    });
    
    // Extract prompt attachments
    const promptAttachments = promptMessages.flatMap(m => m.attachments || []).map(a => ({
      name: a.name || "file",
      mimeType: a.mimeType || "unknown"
    }));

    const userForLog = await userService.getUserByClerkId(String(chat.userId));
    const usernameLog = userForLog?.get("firstName") || userForLog?.get("email")?.split("@")[0] || String(chat.userId);

    // Log token usage to file for comparison
    logTokenUsage({
      model: providerName,
      usage: tokens,
      context: "privateChat",
      username: usernameLog,
      chatTitle: chat.title,
      messageId: (assistantMessageDoc as any)._id?.toString(),
      hasWebSearch: webGrounding ? !("rejected" in webGrounding) : false,
      mcpToolsProvided: tools ? tools.length : 0,
      attachments: promptAttachments,
    });

    if (activeStream.abortController.signal.aborted) {
      yield { done: true, chatId, requestId, status: "stopped" };
      return;
    }

    chatStreamRegistry.complete(requestId);
    yield { done: true, chatId, requestId, status: "completed" };

    // Extract new memories in the background
    const lastUserMessage = (chat.messages as ChatMessage[])
      .filter((m) => m.role === "user")
      .pop();
    if (lastUserMessage) {
      memoryService
        .extractMemoriesFromMessage(chat.userId, lastUserMessage.content)
        .catch((err) => {
          console.error("Background memory extraction failed:", err);
        });
    }
  } catch (aiError) {
    const isTimeout =
      (aiError instanceof Error && aiError.message.includes("timed out")) ||
      firstTokenTimedOut;
    const errorMessage = isTimeout
      ? "AI generation timed out."
      : "An unexpected error occurred during generation.";

    if (activeStream.abortController.signal.aborted && !isTimeout) {
      const promptText = serializePromptMessages(promptMessages);
      const promptAttachmentCount = promptMessages.reduce(
        (sum, m) => sum + (m.attachments?.length || 0),
        0,
      );
      const tokens = resolveAssistantTokens(
        activeStream.usage,
        promptText,
        activeStream.fullResponse,
        promptAttachmentCount,
      );
      await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
        content: activeStream.fullResponse,
        status: "stopped",
        tokens,
      });
      yield { done: true, chatId, requestId, status: "stopped" };
      return;
    }

    console.error("AI Error in chat stream:", aiError);
    const promptText = serializePromptMessages(promptMessages);
    const promptAttachmentCount = promptMessages.reduce(
      (sum, m) => sum + (m.attachments?.length || 0),
      0,
    );
    const tokens = resolveAssistantTokens(
      activeStream.usage,
      promptText,
      "",
      promptAttachmentCount,
    );
    const detailedErrorMessage = `**Failed to generate response.** The model \`${providerName}\` encountered an error or is temporarily unavailable. Please try again.`;
    await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
      content: detailedErrorMessage,
      status: "failed",
      tokens,
    });

    chatStreamRegistry.fail(requestId, detailedErrorMessage);
    yield { error: detailedErrorMessage, status: "failed" };
  }
}

export const chatService = {
  async createChat({
    userId,
    projectId,
    message,
    provider,
    attachments,
    webSearchEnabled,
    selection,
    attachedFile,
  }: CreateChatInput) {
    const resolvedUserId = requireUserId(userId);
    const trimmedMessage = message?.trim() || (selection ? "Explain this" : "");

    const chat = chatRepository.create({
      userId: resolvedUserId,
      title: createTitle(trimmedMessage),
      projectId,
      isSidebarVisible: true,
    });

    await chat.save();
    const chatId = chat._id.toString();

    if (trimmedMessage || (attachments && attachments.length > 0)) {
      // Save User Message
      const userMessage = createUserMessage(
        trimmedMessage || "",
        String(resolvedUserId),
        provider,
        attachments,
      );
      let fileText: string | null = null;
      let allAttachments = attachments || [];

      if (attachedFile) {
        const result = await processAttachedFile(attachedFile, resolvedUserId, allAttachments);
        fileText = result.fileText;
        allAttachments = result.attachments;
      }
      userMessage.metadata = {
        webSearchEnabled: Boolean(webSearchEnabled),
        selection,
      };
      const userPromptText = userMessage.content || "";
      const attachmentCount = attachments?.length || 0;
      userMessage.tokens = {
        promptTokens: estimateTokenCount(userPromptText, attachmentCount),
        completionTokens: 0,
        totalTokens: estimateTokenCount(userPromptText, attachmentCount),
      };
      await chatRepository.saveMessage(chatId, userMessage);

      await aiService.validateModelAccess(provider);
      const aiProvider = aiService.getProvider(provider);
      const providerName = aiProvider.getProviderName();

      // Get history for context
      const messages = [userMessage];
      const { promptMessages, webGrounding } = await buildPromptMessages(
        String(resolvedUserId),
        messages,
        trimmedMessage,
        webSearchEnabled,
        provider,
        chat.projectId ? String(chat.projectId) : undefined,
        chatId,
      );

      let reply = "";
      let usage: TokenUsage | undefined;
      try {
        const hasFiles = promptMessages.some((m) =>
          m.attachments?.some((a: any) => a.mimeType && !a.mimeType.startsWith("image/"))
        );
        const latestUserMsgText = promptMessages.filter(m => m.role === 'user').pop()?.content || "";
        const tools = await getEnabledMcpTools(String(resolvedUserId), hasFiles, latestUserMsgText);
        const response = await aiProvider.generateResponse(
          promptMessages,
          tools,
        );
        reply = response.text;
        usage = response.usage;
      } catch (err) {
        console.error("AI Error in createChat:", err);
        throw new Error("Server Error: AI failed to respond.");
      }

      reply = finalizeGroundedResponse(reply, webGrounding).content;

      // Save Assistant Message
      const assistantPromptText = serializePromptMessages(promptMessages);
      const assistantTokens = resolveAssistantTokens(
        usage,
        assistantPromptText,
        reply,
      );
      await chatRepository.saveMessage(chatId, {
        ...createAssistantMessage(
          reply,
          String(resolvedUserId),
          providerName,
          undefined,
          "completed",
          buildGroundingMetadata(webGrounding),
        ),
        attachments: [],
        type: "text",
        tokens: assistantTokens,
      });

      // Extract new memories in the background
      if (trimmedMessage) {
        memoryService
          .extractMemoriesFromMessage(resolvedUserId, trimmedMessage)
          .catch((err) => {
            console.error("Background memory extraction failed:", err);
          });
      }
    }

    // Fetch the full chat with messages to return
    return await chatRepository.findById(chatId);
  },

  async *createChatStream(input: CreateChatInput) {
    const resolvedUserId = requireUserId(input.userId);
    const trimmedMessage =
      input.message?.trim() || "" || (input.selection ? "Explain this" : "");
    if (!input.selection) {
      requireMessage(
        input.message,
        "message is required for streaming creation",
      );
    }
    const requestId = requireRequestId(input.requestId);

    const chat = chatRepository.create({
      userId: resolvedUserId,
      title: createTitle(trimmedMessage),
      projectId: input.projectId,
    });

    await chat.save();
    const chatId = chat._id.toString();

    // Save User Message
    const userMsg = createUserMessage(
      trimmedMessage,
      String(resolvedUserId),
      input.provider,
      input.attachments,
    ); let fileText: string | null = null;
    let allAttachments = input.attachments || [];
    if (input.attachedFile) {
      const result = await processAttachedFile(input.attachedFile, resolvedUserId, allAttachments);
      fileText = result.fileText;
      allAttachments = result.attachments;
    }
    userMsg.attachments = allAttachments;
    // metadata still has webSearchEnabled and selection, but NOT fileText
    userMsg.metadata = {
      webSearchEnabled: Boolean(input.webSearchEnabled),
      selection: input.selection,
    };
    const userPromptText = userMsg.content || "";
    const attachmentCount = input.attachments?.length || 0;
    userMsg.tokens = {
      promptTokens: estimateTokenCount(userPromptText, attachmentCount),
      completionTokens: 0,
      totalTokens: estimateTokenCount(userPromptText, attachmentCount),
    };
    await chatRepository.saveMessage(chatId, userMsg);

    // Refetch to get messages for prompt
    const fullChat = await chatRepository.findById(chatId);

    yield* streamAssistantResponse(
      fullChat as any,
      requestId,
      input.provider,
      true,
    );
  },

  async sendMessage({
    chatId,
    message,
    provider,
    attachments,
    webSearchEnabled,
    selection,
    attachedFile,
  }: SendMessageInput) {
    const trimmedMessage = message?.trim() || (selection ? "Explain this" : "");
    const chat = await requireChat(chatId);

    // Save User Message
    const userMsg = createUserMessage(
      trimmedMessage,
      String(chat.userId),
      provider,
      attachments,
    );
    let fileText: string | null = null;
    let allAttachments = attachments || [];
    if (attachedFile) {
      const result = await processAttachedFile(attachedFile, String(chat.userId), allAttachments);
      fileText = result.fileText;
      allAttachments = result.attachments;
    }
    userMsg.attachments = allAttachments;
    // metadata still has webSearchEnabled and selection, but NOT fileText
    userMsg.metadata = {
      webSearchEnabled: Boolean(webSearchEnabled),
      selection,
      fileText,
    };
    const userPromptText = userMsg.content || "";
    const attachmentCount = attachments?.length || 0;
    userMsg.tokens = {
      promptTokens: estimateTokenCount(userPromptText, attachmentCount),
      completionTokens: 0,
      totalTokens: estimateTokenCount(userPromptText, attachmentCount),
    };
    await chatRepository.saveMessage(chatId, userMsg);

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      const newTitle = createTitle(trimmedMessage);
      await chatRepository.updateTitle(chatId, newTitle);
      chat.title = newTitle;
    }

    await aiService.validateModelAccess(provider);
    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();

    // Fetch updated history
    const updatedChat = await chatRepository.findById(chatId);
    const { promptMessages, webGrounding } = await buildPromptMessages(
      String(chat.userId),
      updatedChat?.messages as ChatMessage[],
      trimmedMessage,
      webSearchEnabled,
      provider,
      chat.projectId ? String(chat.projectId) : undefined,
    );

    let reply = "";
    let usage: TokenUsage | undefined;
    try {
      const hasFiles = promptMessages.some((m) =>
        m.attachments?.some((a: any) => a.mimeType && !a.mimeType.startsWith("image/"))
      );
      const latestUserMsgText = promptMessages.filter(m => m.role === 'user').pop()?.content || "";
      const tools = await getEnabledMcpTools(String(chat.userId), hasFiles, latestUserMsgText);
      const response = await aiProvider.generateResponse(promptMessages, tools);
      reply = response.text;
      usage = response.usage;
    } catch (err) {
      console.error("AI Error in sendMessage:", err);
      throw new Error("Server Error: AI failed to respond.");
    }

    reply = finalizeGroundedResponse(reply, webGrounding).content;

    // Save Assistant Message
    const assistantPromptText = serializePromptMessages(promptMessages);
    const promptAttachmentCount = promptMessages.reduce(
      (sum, m) => sum + (m.attachments?.length || 0),
      0,
    );
    const assistantTokens = resolveAssistantTokens(
      usage,
      assistantPromptText,
      reply,
      promptAttachmentCount,
    );
    await chatRepository.saveMessage(chatId, {
      ...createAssistantMessage(
        reply,
        String(chat.userId),
        providerName,
        undefined,
        "completed",
        buildGroundingMetadata(webGrounding),
      ),
      attachments: [],
      type: "text",
      tokens: assistantTokens,
    });

    // Extract new memories in the background
    if (trimmedMessage) {
      memoryService
        .extractMemoriesFromMessage(String(chat.userId), trimmedMessage)
        .catch((err) => {
          console.error("Background memory extraction failed:", err);
        });
    }

    return await chatRepository.findById(chatId);
  },

  async *streamMessage({
    chatId,
    message,
    provider,
    requestId,
    attachments,
    webSearchEnabled,
    selection,
    attachedFile,
  }: SendMessageInput) {
    const trimmedMessage = message?.trim() || (selection ? "Explain this" : "");
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);

    // Save User Message
    const userMsg = createUserMessage(
      trimmedMessage,
      String(chat.userId),
      provider,
      attachments,
    );
    let fileText: string | null = null;
    let allAttachments = attachments || [];
    if (attachedFile) {
      const result = await processAttachedFile(attachedFile, String(chat.userId), allAttachments);
      fileText = result.fileText;
      allAttachments = result.attachments;
    }
    userMsg.attachments = allAttachments;
    // metadata still has webSearchEnabled and selection, but NOT fileText
    userMsg.metadata = {
      webSearchEnabled: Boolean(webSearchEnabled),
      selection,
    };
    const userPromptText = userMsg.content || "";
    const attachmentCount = attachments?.length || 0;
    userMsg.tokens = {
      promptTokens: estimateTokenCount(userPromptText, attachmentCount),
      completionTokens: 0,
      totalTokens: estimateTokenCount(userPromptText, attachmentCount),
    };
    await chatRepository.saveMessage(chatId, userMsg);

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      const newTitle = createTitle(trimmedMessage);
      await chatRepository.updateTitle(chatId, newTitle);
      chat.title = newTitle;
    }

    // Refresh chat to include new user message
    const updatedChat = await chatRepository.findById(chatId);

    yield* streamAssistantResponse(
      updatedChat as any,
      resolvedRequestId,
      provider,
    );
  },

  async stopStream({ requestId, chatId }: StopStreamInput) {
    const resolvedRequestId = requireRequestId(requestId);
    const activeStream = chatStreamRegistry.get(resolvedRequestId);

    if (activeStream) {
      if (activeStream.chatId?.startsWith("temp_")) {
        chatStreamRegistry.stop(resolvedRequestId);
        return {
          stopped: true,
          chatId: activeStream.chatId,
          requestId: resolvedRequestId,
        };
      }

      // Keep empty/stopped chats in DB so they can be retried or edited.

      let tokens;
      try {
        const chatObj = await chatRepository.findById(activeStream.chatId);
        const messages = chatObj ? chatObj.messages : [];
        const priorMessages = messages.filter(
          (m) => m.requestId !== resolvedRequestId,
        );
        const promptText = serializePromptMessages(priorMessages);
        const promptAttachmentCount = priorMessages.reduce(
          (sum, m) => sum + (m.attachments?.length || 0),
          0,
        );
        tokens = resolveAssistantTokens(
          activeStream.usage,
          promptText,
          activeStream.fullResponse,
          promptAttachmentCount,
        );
      } catch (err) {
        console.error("Failed to calculate tokens during stream stop:", err);
      }

      // Update message doc in collection
      await chatRepository.updateMessageByRequestId(
        activeStream.chatId,
        resolvedRequestId,
        {
          content: activeStream.fullResponse,
          status: "stopped",
          tokens,
        },
      );

      chatStreamRegistry.stop(resolvedRequestId);
      return {
        stopped: true,
        chatId: activeStream.chatId,
        requestId: resolvedRequestId,
      };
    }

    // Ensure we register this requestId in the stopped list to prevent it from starting in the future
    chatStreamRegistry.stop(resolvedRequestId);

    // Keep empty/stopped chats in DB so they can be retried or edited.

    const updatedMessage = await chatRepository.updateMessageByRequestId(
      chatId,
      resolvedRequestId,
      {
        status: "stopped",
      },
    );

    return {
      stopped: !!updatedMessage,
      chatId: updatedMessage?.chatId?.toString() || chatId,
      requestId: resolvedRequestId,
    };
  },

  getAllChats(
    userId?: string,
    page: number = 1,
    limit: number = 20,
    isArchived: boolean = false,
  ) {
    return chatRepository.findAllByUserId(
      requireUserId(userId),
      page,
      limit,
      isArchived,
    );
  },

  async searchChats(userId: string, query: string) {
    return await chatRepository.searchChats(requireUserId(userId), query);
  },

  getChatById(chatId: string) {
    return requireChat(chatId);
  },

  async deleteChat(chatId: string) {
    await cleanupChatFiles(chatId);

    const chat = await chatRepository.deleteById(chatId);

    if (!chat) {
      const error = new Error("Chat not found");
      error.name = "NotFoundError";
      throw error;
    }

    return chat;
  },

  async updateChat(chatId: string, data: { title?: string; projectId?: string | null }) {
    const updateData: any = {};
    if (data.title !== undefined) {
      updateData.title = requireMessage(data.title, "Title is required");
    }
    if (data.projectId !== undefined) {
      updateData.projectId = data.projectId;
    }

    const chat = await chatRepository.update(chatId, { $set: updateData });

    if (!chat) {
      const error = new Error("Chat not found");
      error.name = "NotFoundError";
      throw error;
    }

    return chat;
  },

  async getGallery(userId: string) {
    const resolvedUserId = requireUserId(userId);
    const messages = await chatRepository.findUserAttachments(resolvedUserId);

    const gallery = [];
    for (const msg of messages) {
      if (!msg.attachments) continue;

      for (const att of msg.attachments) {
        gallery.push({
          url: att.url,
          name: att.name,
          mimeType: att.mimeType,
          size: att.size,
          messageId: String((msg as any)._id),
          chatId: String((msg as any).chatId),
          createdAt: (msg as any).createdAt,
        });
      }
    }

    return gallery;
  },

  async archiveChat(chatId: string) {
    const chat = await chatRepository.archiveChat(chatId);

    if (!chat) {
      const error = new Error("Chat not found");
      error.name = "NotFoundError";
      throw error;
    }

    return chat;
  },

  async unarchiveChat(chatId: string) {
    const chat = await chatRepository.unarchiveChat(chatId);

    if (!chat) {
      const error = new Error("Chat not found");
      error.name = "NotFoundError";
      throw error;
    }

    return chat;
  },

  async pinChat(chatId: string) {
    const chat = await chatRepository.pinChat(chatId);

    if (!chat) {
      const error = new Error("Chat not found");
      error.name = "NotFoundError";
      throw error;
    }

    return chat;
  },

  async unpinChat(chatId: string) {
    const chat = await chatRepository.unpinChat(chatId);

    if (!chat) {
      const error = new Error("Chat not found");
      error.name = "NotFoundError";
      throw error;
    }

    return chat;
  },

  async editMessage({
    chatId,
    messageId,
    content,
    provider,
    webSearchEnabled,
    attachments,
    attachedFile,
    selection,
  }: EditMessageInput) {
    const trimmedMessage = requireMessage(content);
    const chat = await requireChat(chatId);

    // Delete all messages after this one
    await chatRepository.deleteMessagesAfter(chatId, messageId);

    let fileText: string | null = null;
    let allAttachments = attachments || [];
    if (attachedFile) {
      const result = await processAttachedFile(attachedFile, String(chat.userId), allAttachments);
      fileText = result.fileText;
      allAttachments = result.attachments;
    }

    // Update the message itself
    await chatRepository.updateMessage(messageId, {
      content: trimmedMessage,
      attachments: allAttachments as any,
      metadata: {
        webSearchEnabled: Boolean(webSearchEnabled),
        fileText,
        ...(selection !== undefined ? { selection } : {}),
      },
    });

    await aiService.validateModelAccess(provider);
    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();

    // Fetch updated history
    const updatedChat = await chatRepository.findById(chatId);
    const { promptMessages, webGrounding } = await buildPromptMessages(
      String(chat.userId),
      updatedChat?.messages as ChatMessage[],
      trimmedMessage,
      webSearchEnabled,
      provider,
      chat.projectId ? String(chat.projectId) : undefined,
    );

    let reply = "";
    let usage: TokenUsage | undefined;
    try {
      const response = await aiProvider.generateResponse(promptMessages);
      reply = response.text;
      usage = response.usage;
    } catch (err) {
      console.error("AI Error in editMessage:", err);
      throw new Error("Server Error: AI failed to respond.");
    }

    reply = finalizeGroundedResponse(reply, webGrounding).content;
    const { attachments: aiAttachments, type } = parseMultimedia(reply);

    // Update Assistant Message
    await chatRepository.saveMessage(chatId, {
      ...createAssistantMessage(
        reply,
        String(chat.userId),
        providerName,
        undefined,
        "completed",
        buildGroundingMetadata(webGrounding),
      ),
      attachments: aiAttachments,
      type: type as any,
      tokens: resolveAssistantTokens(
        usage,
        serializePromptMessages(promptMessages),
        reply,
        promptMessages.reduce(
          (sum, m) => sum + (m.attachments?.length || 0),
          0,
        ),
      ),
    });

    // Check if it's the first message to update title
    if (updatedChat?.messages?.[0]?.id === messageId) {
      await chatRepository.update(chatId, {
        title: createTitle(trimmedMessage),
      });
    }

    return await chatRepository.findById(chatId);
  },

  async *streamEditMessage({
    chatId,
    messageId,
    content: editedContent,
    provider,
    requestId,
    webSearchEnabled,
    attachments,
    attachedFile,
    selection,
  }: EditMessageInput) {
    // IMMUTABLE EDIT STREAM:
    // 1. Assign branchId to original user message if none exists yet.
    // 2. Deactivate original user message and all active messages after it.
    // 3. Create a NEW user message as a sibling, inheriting the same parentId.
    // 4. Stream a new assistant message linked to this new user message.
    const trimmedMessage = requireMessage(editedContent);
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);
    const allMessages = chat.messages as RawMessage[];

    let resolvedMessageId = messageId;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(messageId);

    if (!isObjectId) {
      const targetMessage = allMessages.find(
        (m) =>
          m.requestId === messageId ||
          m.metadata?.tempId === messageId ||
          m.id === messageId,
      );

      if (targetMessage) {
        resolvedMessageId = String(targetMessage._id || targetMessage.id);
      } else {
        const lastUserMsg = allMessages.filter((m) => m.role === "user").pop();
        if (lastUserMsg) {
          resolvedMessageId = String(lastUserMsg._id || lastUserMsg.id);
        } else {
          throw new Error("Message not found for edit");
        }
      }
    }

    const originalMsg = allMessages.find(
      (m) =>
        String(m._id) === resolvedMessageId ||
        m.id === resolvedMessageId ||
        m.requestId === resolvedMessageId,
    );
    if (!originalMsg) throw new Error("Message not found for edit");

    let fileText: string | null = null;
    let allAttachments = attachments || [];
    if (attachedFile) {
      const result = await processAttachedFile(attachedFile, String(chat.userId), allAttachments);
      fileText = result.fileText;
      allAttachments = result.attachments;
    }

    const origId = String(originalMsg._id);

    // ── Determine the branchId and parentId (Preserve the ORIGINAL stable parentId & branchId) ──
    let sharedBranchId = originalMsg.branchId ? String(originalMsg.branchId) : null;
    let parentId: string | undefined = undefined;

    if (originalMsg.parentId) {
      parentId = String(originalMsg.parentId);
    }

    // If it's already a branched message, find if we can locate branchId and parentId from siblings
    if (sharedBranchId) {
      const siblingWithParent = allMessages.find(
        (m) => m.branchId === sharedBranchId && m.parentId
      );
      if (siblingWithParent) {
        parentId = String(siblingWithParent.parentId);
      }
    }

    // If still no parentId, check if there is an existing branch group for edits of this message
    let isAlreadyBranched = !!sharedBranchId;
    if (!sharedBranchId) {
      const sibling = allMessages.find(
        (m) => m.editedFrom === messageId || String(m._id) === messageId || m.id === messageId
      );
      if (sibling && sibling.branchId) {
        sharedBranchId = String(sibling.branchId);
        isAlreadyBranched = true;
        if (sibling.parentId) {
          parentId = String(sibling.parentId);
        }
      }
    }

    // If it's the very first edit (legacy or fresh linear message), infer parentId once from preceding assistant
    if (!isAlreadyBranched && !parentId) {
      const originalMsgIndex = allMessages.findIndex(
        (m) => String(m._id) === origId || m.id === messageId
      );
      const precedingAssistant = allMessages
        .slice(0, originalMsgIndex >= 0 ? originalMsgIndex : undefined)
        .filter((m) => m.role === "assistant")
        .pop();
      if (precedingAssistant) {
        parentId = String(precedingAssistant._id || precedingAssistant.id);
      }
    }

    // ── Assign branchId to the original user message if none exists ──
    let isFirstEdit = !isAlreadyBranched;
    if (isFirstEdit) {
      if (!sharedBranchId) {
        const { randomUUID } = await import("crypto");
        sharedBranchId = randomUUID();
      }
      // Persist branchId=shared, version=1, isActive=false, parentId=parentId on original user message
      await chatRepository.updateMessage(origId, {
        branchId: sharedBranchId,
        version: 1,
        isActive: false,
        parentId: parentId || undefined,
      } as any);
    } else {
      // Deactivate siblings in this branch
      await chatRepository.updateMany({ chatId, branchId: sharedBranchId }, { isActive: false });
    }

    // Calculate version for the new sibling user message
    const siblings = allMessages.filter((m) => m.branchId === sharedBranchId || String(m._id) === origId);
    const userEditVersion = Math.max(...siblings.map((m) => m.version ?? 1), 1) + 1;

    // Save the new sibling user message under the SAME parentId
    const newUserMsg = await chatRepository.saveMessage(chatId, {
      role: "user",
      userId: String(chat.userId),
      content: trimmedMessage,
      attachments: allAttachments as any,
      status: "completed",
      metadata: {
        webSearchEnabled: Boolean(webSearchEnabled),
        fileText,
        ...(selection !== undefined ? { selection } : {}),
      },
      parentId: parentId || undefined, // Inherit same parent!
      editedFrom: messageId,
      branchId: sharedBranchId,
      version: userEditVersion,
      isActive: true,
    } as any);

    const newUserMsgId = String((newUserMsg as any)._id);

    // Build branch metadata for the new assistant response
    const { randomUUID: assistantRandomUUID } = await import("crypto");
    const assistantBranchMeta = {
      parentId: newUserMsgId,
      editedFrom: messageId,
      branchId: assistantRandomUUID(),
      version: 1,
    };

    // Update title if this was the first message
    if (
      allMessages[0] &&
      (String(allMessages[0]._id) === resolvedMessageId ||
        allMessages[0].id === resolvedMessageId)
    ) {
      await chatRepository.update(chatId, { title: createTitle(trimmedMessage) });
    }

    // Build context up to the original user message's parent (not including originalMsg itself)
    const contextBefore = getContextBeforeMessage(allMessages, origId) as ChatMessage[];
    const contextWithNewUser: ChatMessage[] = [
      ...contextBefore,
      {
        role: "user",
        userId: String(chat.userId),
        content: trimmedMessage,
        attachments: allAttachments as any,
        status: "completed",
        metadata: { webSearchEnabled: Boolean(webSearchEnabled), fileText, selection },
      } as any,
    ];

    const syntheticChat = { ...chat, messages: contextWithNewUser };

    yield* streamAssistantResponse(
      syntheticChat as any,
      resolvedRequestId,
      provider,
      false,
      undefined,
      webSearchEnabled,
      assistantBranchMeta,
    );
  },

  async retryMessage({
    chatId,
    messageId,
    provider,
  }: {
    chatId: string;
    messageId: string;
    provider?: string;
  }) {
    // IMMUTABLE RETRY: never delete the old message.
    // Create a NEW assistant message linked to the same parentId/branchId.
    const chat = await requireChat(chatId);
    const allMessages = chat.messages as RawMessage[];

    const assistantMessage =
      allMessages.find(
        (m) =>
          (String(m._id) === messageId || m.id === messageId || m.requestId === messageId) &&
          m.role === "assistant",
      ) ?? [...allMessages].filter((m) => m.role === "assistant").pop();

    if (!assistantMessage) throw new Error("Assistant message not found for retry");

    const parentId = assistantMessage.parentId
      ? String(assistantMessage.parentId)
      : String([...allMessages].filter((m) => m.role === "user").pop()?._id ?? "");

    const contextMessages = getContextBeforeMessage(allMessages, String(assistantMessage._id)) as ChatMessage[];
    const lastUserMessage = [...contextMessages].filter((m) => m.role === "user").pop();

    const { version, branchId } = nextVersionForParent(allMessages, parentId);

    if (assistantMessage.branchId) {
      await chatRepository.setActiveBranchMessage(chatId, String(assistantMessage.branchId), "__none__");
    }

    await aiService.validateModelAccess(provider);
    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();

    const { promptMessages, webGrounding } = await buildPromptMessages(
      String(chat.userId),
      contextMessages,
      lastUserMessage?.content,
      Boolean(lastUserMessage?.metadata?.webSearchEnabled),
      provider,
      chat.projectId ? String(chat.projectId) : undefined,
    );

    let reply = "";
    let usage: TokenUsage | undefined;
    try {
      const response = await aiProvider.generateResponse(promptMessages);
      reply = response.text;
      usage = response.usage;
    } catch (err) {
      console.error("AI Error in retryMessage:", err);
      throw new Error("Server Error: AI failed to respond.");
    }

    reply = finalizeGroundedResponse(reply, webGrounding).content;

    await chatRepository.saveMessage(chatId, {
      role: "assistant",
      userId: String(chat.userId),
      content: reply,
      model: providerName,
      status: "completed",
      metadata: buildGroundingMetadata(webGrounding),
      parentId: parentId || undefined,
      retryOf: String(assistantMessage._id),
      branchId,
      version,
      isActive: true,
      tokens: resolveAssistantTokens(
        usage,
        serializePromptMessages(promptMessages),
        reply,
        promptMessages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0),
      ),
    } as any);

    return await chatRepository.findById(chatId);
  },

  async *streamRetryMessage({
    chatId,
    messageId,
    provider,
    requestId,
    webSearchEnabled,
  }: {
    chatId: string;
    messageId: string;
    provider?: string;
    requestId: string;
    webSearchEnabled?: boolean;
  }) {
    // IMMUTABLE RETRY STREAM: preserve old response, create a new node.
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);
    const allMessages = chat.messages as RawMessage[];

    // Locate the assistant message being retried (by id or requestId)
    let assistantMessage = allMessages.find(
      (m) =>
        (String(m._id) === messageId || m.id === messageId || m.requestId === messageId) &&
        m.role === "assistant",
    );
    if (!assistantMessage && messageId.includes("-")) {
      assistantMessage = [...allMessages].filter((m) => m.role === "assistant").pop();
    }
    if (!assistantMessage) {
      throw new Error("Assistant message not found for retry");
    }

    const origId = String(assistantMessage._id);

    // Determine parentId (user message that triggered this assistant response)
    const assistantIndex = allMessages.indexOf(assistantMessage);
    const parentId = assistantMessage.parentId
      ? String(assistantMessage.parentId)
      : String(
          allMessages
            .slice(0, assistantIndex >= 0 ? assistantIndex : undefined)
            .filter((m) => m.role === "user")
            .pop()?._id ?? ""
        );

    // ── Assign a branchId to the original message if it doesn't have one yet ──
    // This is needed on the very first retry so both original and new share a branchId.
    let sharedBranchId = assistantMessage.branchId ? String(assistantMessage.branchId) : null;
    if (!sharedBranchId) {
      const { randomUUID } = await import("crypto");
      sharedBranchId = randomUUID();
      // Persist branchId=shared, version=1, isActive=false, parentId=parentId on the original
      await chatRepository.updateMessage(origId, {
        branchId: sharedBranchId,
        version: 1,
        isActive: false,
        parentId: parentId || undefined,
      } as any);
    } else {
      // Deactivate all existing siblings in this branch
      await chatRepository.updateMany({ chatId, branchId: sharedBranchId }, { isActive: false });
    }

    // Count existing siblings to compute the next version
    const siblings = allMessages.filter((m) => m.branchId === sharedBranchId || String(m._id) === origId);
    const nextVersion = Math.max(...siblings.map((m) => m.version ?? 1), 1) + 1;

    // Build prompt context from active-branch messages before the retried assistant message
    const contextMessages = getContextBeforeMessage(allMessages, origId);

    const branchMeta = {
      parentId,
      retryOf: origId,
      branchId: sharedBranchId,
      version: nextVersion,
    };

    // Synthetic chat with only the relevant context
    const syntheticChat = { ...chat, messages: contextMessages };

    yield* streamAssistantResponse(
      syntheticChat as any,
      resolvedRequestId,
      provider,
      false,
      undefined,
      webSearchEnabled,
      branchMeta,
    );
  },

  async updateMessageFeedback(
    messageId: string,
    feedback: "like" | "dislike" | null,
  ) {
    return await chatRepository.updateMessage(messageId, { feedback });
  },

  /**
   * Navigate to a specific generation within a branchId group.
   * Marks the chosen message as active and all siblings as inactive.
   */
  async setActiveBranch(chatId: string, branchId: string, messageId: string) {
    return chatRepository.setActiveBranchMessage(chatId, branchId, messageId);
  },

  /**
   * Return all assistant generations for a given parent user message,
   * sorted by version ascending.
   */
  async getMessageGenerations(parentId: string) {
    return chatRepository.getMessagesByParentId(parentId);
  },
};
