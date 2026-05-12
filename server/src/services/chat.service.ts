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
  StopStreamInput,
  StreamPayload,
} from "../types/chat.types";
import { getLimitedMessages, parseMultimedia } from "../utils/chatHistory";
import {
  type WebGroundingContext,
  webSearchService,
} from "../modules/web-search";
import { aiService } from "./ai.service";
import { chatStreamRegistry } from "./chatStreamRegistry.service";
import { memoryService } from "./memory.service";
import { userService } from "./user.service";

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

const buildGroundingMetadata = (webGrounding: WebGroundingContext | null) => {
  if (!webGrounding) return undefined;

  return {
    grounded: true,
    debug: webGrounding.debug,
    sources: webGrounding.sources.map(({ id, title, url, hostname }) => ({
      id,
      title,
      url,
      hostname,
    })),
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

const buildPromptMessages = async (
  userId: string,
  chatMessages: ChatMessage[],
  latestUserMessage?: string,
  webSearchEnabled = false,
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

  const personalizationContext = await userService.getPersonalizationContext(
    userId,
  );
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

  let webGrounding = null;
  if (webSearchEnabled && latestUserMessage) {
    webGrounding = await webSearchService.buildGroundingContext(latestUserMessage);
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
): AsyncGenerator<StreamPayload> {
  const aiProvider = aiService.getProvider(provider);
  const providerName = aiProvider.getProviderName();
  const chatId = getChatId(chat);
  const lastUserMessage = (chat.messages as ChatMessage[])
    .filter((m) => m.role === "user")
    .pop();
  const { promptMessages, webGrounding } = await buildPromptMessages(
    String(chat.userId),
    chat.messages as ChatMessage[],
    lastUserMessage?.content,
    Boolean(lastUserMessage?.metadata?.webSearchEnabled),
  );

  // Create assistant message in its own collection
  const assistantMessageDoc = await chatRepository.saveMessage(chatId, {
    role: "assistant",
    userId: chat.userId,
    content: "",
    model: providerName,
    requestId,
    status: "streaming",
    metadata: buildGroundingMetadata(webGrounding),
  });

  const activeStream = chatStreamRegistry.create({
    requestId,
    chatId,
    messageId: (assistantMessageDoc as any)._id?.toString() || "",
    model: providerName,
  });

  yield includeChatId
    ? { chatId, requestId, model: providerName, status: "streaming" }
    : { requestId, model: providerName, status: "streaming" };

  let fullResponse = "";
  let receivedFirstChunk = false;
  let firstTokenTimedOut = false;

  try {
    const stream = aiProvider.generateStreamResponse(
      promptMessages,
      activeStream.abortController.signal,
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

    const groundedResponse = finalizeGroundedResponse(fullResponse, webGrounding);
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

    // Parse multimedia from the final response
    const { attachments, type } = parseMultimedia(fullResponse);

    // Update message doc in collection
    await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
      content: fullResponse,
      status: finalStatus,
      model: providerName,
      attachments,
      type: type as any,
      metadata: buildGroundingMetadata(webGrounding),
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
      ? "AI generation timed out. Please try again."
      : "Server Error: AI failed to respond.";

    if (activeStream.abortController.signal.aborted && !isTimeout) {
      await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
        content: activeStream.fullResponse,
        status: "stopped",
      });
      yield { done: true, chatId, requestId, status: "stopped" };
      return;
    }

    console.error("AI Error in chat stream:", aiError);
    await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
      status: "failed",
    });

    chatStreamRegistry.fail(requestId, errorMessage);
    yield { error: errorMessage, status: "failed" };
  }
}

export const chatService = {
  async createChat({
    userId,
    message,
    provider,
    attachments,
    webSearchEnabled,
  }: CreateChatInput) {
    const resolvedUserId = requireUserId(userId);
    const trimmedMessage = message?.trim() || "";

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
      );

      let reply = "";
      try {
        reply = await aiProvider.generateResponse(promptMessages);
      } catch (err) {
        console.error("AI Error in createChat:", err);
        throw new Error("Server Error: AI failed to respond.");
      }

      reply = finalizeGroundedResponse(reply, webGrounding).content;

      // Parse multimedia from reply
      const { attachments: aiAttachments, type } = parseMultimedia(reply);

      // Save Assistant Message
      await chatRepository.saveMessage(chatId, {
        ...createAssistantMessage(
          reply,
          String(resolvedUserId),
          providerName,
          undefined,
          "completed",
          buildGroundingMetadata(webGrounding),
        ),
        attachments: aiAttachments,
        type: type as any,
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
    const trimmedMessage = requireMessage(
      input.message,
      "message is required for streaming creation",
    );
    const requestId = requireRequestId(input.requestId);

    const chat = chatRepository.create({
      userId: resolvedUserId,
      title: createTitle(trimmedMessage),
    });

    await chat.save();
    const chatId = chat._id.toString();

    // Save User Message
    await chatRepository.saveMessage(
      chatId,
      {
        ...createUserMessage(
          trimmedMessage,
          String(resolvedUserId),
          input.provider,
          input.attachments,
        ),
        metadata: {
          webSearchEnabled: Boolean(input.webSearchEnabled),
        },
      },
    );

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
  }: SendMessageInput) {
    const trimmedMessage = message?.trim() || "";
    const chat = await requireChat(chatId);

    // Save User Message
    await chatRepository.saveMessage(
      chatId,
      {
        ...createUserMessage(
          trimmedMessage,
          String(chat.userId),
          provider,
          attachments,
        ),
        metadata: {
          webSearchEnabled: Boolean(webSearchEnabled),
        },
      },
    );

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = createTitle(trimmedMessage);
      await (chat as any).save();
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
    );

    let reply = "";
    try {
      reply = await aiProvider.generateResponse(promptMessages);
    } catch (err) {
      console.error("AI Error in sendMessage:", err);
      throw new Error("Server Error: AI failed to respond.");
    }

    reply = finalizeGroundedResponse(reply, webGrounding).content;

    // Parse multimedia from reply
    const { attachments: aiAttachments, type } = parseMultimedia(reply);

    // Save Assistant Message
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
  }: SendMessageInput) {
    const trimmedMessage = message?.trim() || "";
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);

    // Save User Message
    await chatRepository.saveMessage(
      chatId,
      {
        ...createUserMessage(
          trimmedMessage,
          String(chat.userId),
          provider,
          attachments,
        ),
        metadata: {
          webSearchEnabled: Boolean(webSearchEnabled),
        },
      },
    );

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = createTitle(trimmedMessage);
      await (chat as any).save();
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
      // Update message doc in collection
      await chatRepository.updateMessageByRequestId(
        activeStream.chatId,
        resolvedRequestId,
        {
          content: activeStream.fullResponse,
          status: "stopped",
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

  getAllChats(userId?: string) {
    return chatRepository.findAllByUserId(requireUserId(userId));
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
    const chat = await requireChat(chatId);
    chat.title = requireMessage(title, "Title is required");
    await chat.save();
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
};
