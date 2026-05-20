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
} from "../utils/tokenCounter";

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
  if (!webGrounding || "rejected" in webGrounding) return undefined;
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

  const alreadyHasSources = webGrounding.sources.some((source) =>
    response.includes(source.url),
  );

  if (alreadyHasSources || /(^|\n)Sources:\s*$/im.test(response)) {
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
) =>
  usage ?? calculateUsage(promptText, completionText, promptAttachmentCount);

const getEnabledMcpTools = async (userId: string) => {
  const user = await userService.getUserByClerkId(userId);
  const disabledMcpServers = (user?.get("disabledMcpServers") || []) as string[];
  const allTools = await mcpClientService.getActiveTools();

  return allTools.filter(
    (tool) => !disabledMcpServers.includes(tool._serverName),
  );
};

const buildPromptMessages = async (
  userId: string,
  chatMessages: ChatMessage[],
  latestUserMessage?: string,
  webSearchEnabled = false,
  provider?: string,
) => {
  const rawPromptMessages = getLimitedMessages(chatMessages);
  const promptMessages = rawPromptMessages.map((m) => {
    const raw = typeof (m as any).toObject === "function" ? (m as any).toObject() : { ...m };
    return { ...raw };
  });

  const lastMsg = promptMessages[promptMessages.length - 1];
  if (lastMsg && lastMsg.role === "user" && lastMsg.metadata?.selection) {
    const selection = lastMsg.metadata.selection;
    const userRequest = lastMsg.content?.trim() || "Explain this.";
    lastMsg.content = `User selected text from a previous assistant message.

Selected text:
"${selection.selectedText}"

Original message:
"${selection.originalSourceMessage}"

User request:
${userRequest}`;
  }
  const systemMessages: ChatMessage[] = [
    {
      role: "system",
      content: BASE_SYSTEM_PROMPT,
      userId,
      status: "completed",
    },
  ];

  const personalizationContext =
    await userService.getPersonalizationContext(userId);
  if (personalizationContext) {
    systemMessages.push({
      role: "system",
      content: personalizationContext,
      userId,
      status: "completed",
    });
  }

  const memoryContext = await memoryService.getMemoryContext(
    userId,
    latestUserMessage,
  );
  if (memoryContext) {
    systemMessages.push({
      role: "system",
      content: memoryContext,
      userId,
      status: "completed",
    });
  }

  let webGrounding: WebGroundingContext | null = null;
  const supportsImages = provider?.startsWith("gemini");
  if (webSearchEnabled && latestUserMessage) {
    const result = await webSearchService.buildGroundingContext(
      latestUserMessage,
      chatMessages,
      userId,
      supportsImages,
    );

    // Handle quota/cooldown rejections gracefully
    if (result && "rejected" in result) {
      console.warn(
        `[chat] Web search rejected: ${result.reason} — ${result.message}`,
      );
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

async function* streamAssistantResponse(
  chat: Awaited<ReturnType<typeof requireChat>>,
  requestId: string,
  provider?: string,
  includeChatId = false,
  existingAssistantMessageId?: string,
): AsyncGenerator<StreamPayload> {
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

  const { promptMessages, webGrounding } = await buildPromptMessages(
    String(chat.userId),
    messagesForPrompt,
    lastUserMessage?.content,
    Boolean(lastUserMessage?.metadata?.webSearchEnabled),
    provider,
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
    // Create assistant message in its own collection
    assistantMessageDoc = await chatRepository.saveMessage(chatId, {
      role: "assistant",
      userId: chat.userId,
      content: "",
      model: providerName,
      requestId,
      status: "streaming",
      metadata: buildGroundingMetadata(webGrounding),
    });
  }

  const messageId = (assistantMessageDoc as any)._id?.toString() || "";
  const activeStream = chatStreamRegistry.create({
    requestId,
    chatId,
    messageId,
    model: providerName,
  });

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
      sources: webGrounding.sources.map((s) => ({
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
    const tools = await getEnabledMcpTools(String(chat.userId));
    const stream = await aiProvider.generateStreamResponse(
      promptMessages,
      activeStream.abortController.signal,
      tools,
    );

    // 30s timeout for first token
    const timeout = setTimeout(() => {
      if (!receivedFirstChunk) {
        console.error(`AI generation timed out for requestId: ${requestId}`);
        firstTokenTimedOut = true;
        activeStream.abortController.abort();
      }
    }, 30000);

    try {
      for await (const chunk of stream) {
        if (activeStream.abortController.signal.aborted) {
          break;
        }

        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          firstTokenTimedOut = false;
          clearTimeout(timeout);
        }

        fullResponse += chunk;
        chatStreamRegistry.updateResponse(requestId, fullResponse, chunk);
        yield { chunk, requestId, status: "streaming" };
      }
    } finally {
      clearTimeout(timeout);
    }

    chatStreamRegistry.updateUsage(requestId, await stream.usage);

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
    const detailedErrorMessage = `⚠️ **Failed to generate response.** The model \`${providerName}\` encountered an error or is temporarily unavailable. Please try again.`;
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
    message,
    provider,
    attachments,
    webSearchEnabled,
    selection,
  }: CreateChatInput) {
    const resolvedUserId = requireUserId(userId);
    const trimmedMessage = message?.trim() || (selection ? "Explain this" : "");

    const chat = chatRepository.create({
      userId: resolvedUserId,
      title: createTitle(trimmedMessage),
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
      );

      let reply = "";
      let usage: TokenUsage | undefined;
      try {
        const tools = await getEnabledMcpTools(String(resolvedUserId));
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
    const trimmedMessage = (input.message?.trim() || "") || (input.selection ? "Explain this" : "");
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
    });

    await chat.save();
    const chatId = chat._id.toString();

    // Save User Message
    const userMsg = createUserMessage(
      trimmedMessage,
      String(resolvedUserId),
      input.provider,
      input.attachments,
    );
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
    );

    let reply = "";
    let usage: TokenUsage | undefined;
    try {
      const tools = await getEnabledMcpTools(String(chat.userId));
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

    if (chatId) {
      await chatRepository.updateMessageByRequestId(chatId, resolvedRequestId, {
        status: "stopped",
      });
    }

    return {
      stopped: false,
      chatId,
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
    const chat = await chatRepository.deleteById(chatId);

    if (!chat) {
      const error = new Error("Chat not found");
      error.name = "NotFoundError";
      throw error;
    }

    return chat;
  },

  async updateChatTitle(chatId: string, title: string) {
    const validatedTitle = requireMessage(title, "Title is required");
    const chat = await chatRepository.updateTitle(chatId, validatedTitle);

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
  }: EditMessageInput) {
    const trimmedMessage = requireMessage(content);
    const chat = await requireChat(chatId);

    // Delete all messages after this one
    await chatRepository.deleteMessagesAfter(chatId, messageId);

    // Update the message itself
    await chatRepository.updateMessage(messageId, {
      content: trimmedMessage,
      metadata: {
        webSearchEnabled: Boolean(webSearchEnabled),
      },
    });

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
        promptMessages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0),
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
    content,
    provider,
    requestId,
    webSearchEnabled,
  }: EditMessageInput) {
    const trimmedMessage = requireMessage(content);
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);

    // Delete all messages after this one
    await chatRepository.deleteMessagesAfter(chatId, messageId);

    // Update the message itself
    await chatRepository.updateMessage(messageId, {
      content: trimmedMessage,
      metadata: {
        webSearchEnabled: Boolean(webSearchEnabled),
      },
    });

    // Refresh chat to include updated user message
    const updatedChat = await chatRepository.findById(chatId);

    // Check if it's the first message to update title
    if (updatedChat?.messages?.[0]?.id === messageId) {
      await chatRepository.update(chatId, {
        title: createTitle(trimmedMessage),
      });
    }

    yield* streamAssistantResponse(
      updatedChat as any,
      resolvedRequestId,
      provider,
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
    const chat = await requireChat(chatId);
    let assistantMessage = (chat.messages as any[]).find(
      (m) =>
        (m.id === messageId ||
          String(m._id) === messageId ||
          m.requestId === messageId) &&
        m.role === "assistant",
    );

    // Fallback for old messages with mismatched UUIDs: use the last assistant message
    if (!assistantMessage && messageId.includes("-")) {
      assistantMessage = (chat.messages as any[])
        .filter((m) => m.role === "assistant")
        .pop();
    }

    if (!assistantMessage) {
      throw new Error("Assistant message not found for retry");
    }

    // Filter context to messages before this one
    const contextMessages = (chat.messages as any[]).filter(
      (m) => new Date(m.createdAt) < new Date(assistantMessage.createdAt),
    );

    const lastUserMessage = contextMessages
      .filter((m) => m.role === "user")
      .pop();

    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();

    const { promptMessages, webGrounding } = await buildPromptMessages(
      String(chat.userId),
      contextMessages,
      lastUserMessage?.content,
      Boolean(lastUserMessage?.metadata?.webSearchEnabled),
      provider,
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

    await chatRepository.updateMessage(messageId, {
      content: reply,
      status: "completed",
      model: providerName,
      metadata: buildGroundingMetadata(webGrounding),
      tokens: resolveAssistantTokens(
        usage,
        serializePromptMessages(promptMessages),
        reply,
        promptMessages.reduce((sum, m) => sum + (m.attachments?.length || 0), 0),
      ),
    });

    return await chatRepository.findById(chatId);
  },

  async *streamRetryMessage({
    chatId,
    messageId,
    provider,
    requestId,
  }: {
    chatId: string;
    messageId: string;
    provider?: string;
    requestId: string;
  }) {
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);

    console.log("Retrying messageId:", messageId);
    console.log("Chat messages count:", chat.messages.length);
    console.log(
      "Last 2 messages:",
      chat.messages
        .slice(-2)
        .map((m: any) => ({
          id: m.id,
          _id: m._id,
          requestId: m.requestId,
          role: m.role,
        })),
    );

    let assistantMessage = (chat.messages as any[]).find(
      (m) =>
        (m.id === messageId ||
          String(m._id) === messageId ||
          m.requestId === messageId) &&
        m.role === "assistant",
    );

    // Fallback for old messages with mismatched UUIDs: use the last assistant message
    if (!assistantMessage && messageId.includes("-")) {
      console.log("Using fallback: Finding last assistant message in chat");
      assistantMessage = (chat.messages as any[])
        .filter((m) => m.role === "assistant")
        .pop();
    }

    if (!assistantMessage) {
      console.log(
        "FAILED TO FIND MESSAGE. IDs in chat:",
        chat.messages.map((m: any) => m.id || m._id),
      );
      throw new Error("Assistant message not found for retry");
    }

    // Filter chat messages to only include those before the message being retried
    const filteredMessages = (chat.messages as any[]).filter(
      (m) => new Date(m.createdAt) < new Date(assistantMessage.createdAt),
    );

    const updatedChat = {
      ...chat,
      messages: filteredMessages,
    };

    yield* streamAssistantResponse(
      updatedChat as any,
      resolvedRequestId,
      provider,
      false,
      messageId,
    );
  },

  async updateMessageFeedback(
    messageId: string,
    feedback: "like" | "dislike" | null,
  ) {
    return await chatRepository.updateMessage(messageId, { feedback });
  },
};
