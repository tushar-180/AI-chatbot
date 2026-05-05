import {
  CHAT_TITLE_MAX_LENGTH,
  DEFAULT_AI_PROVIDER,
  DEFAULT_CHAT_TITLE,
} from "../constants/chat.constants";
import { chatRepository } from "../repositories/chat.repository";
import type {
  ChatMessage,
  CreateChatInput,
  SendMessageInput,
  StopStreamInput,
  StreamPayload,
} from "../types/chat.types";
import { getLimitedMessages } from "../utils/chatHistory";
import { aiService } from "./ai.service";
import { chatStreamRegistry } from "./chatStreamRegistry.service";

const getChatId = (chat: { _id: unknown }) => String(chat._id);

const createUserMessage = (content: string, provider?: string): ChatMessage => ({
  role: "user",
  content,
  model: provider || DEFAULT_AI_PROVIDER,
  status: "completed",
});

const createAssistantMessage = (
  content: string,
  model: string,
  requestId?: string,
  status: ChatMessage["status"] = "completed",
): ChatMessage => ({
  role: "assistant",
  content,
  model,
  requestId,
  status,
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

const requireMessage = (message?: string, messageText = "message is required") => {
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
  (chat.messages as any[]).find(
    (message) =>
      message.role === "assistant" && message.requestId === requestId,
  );

async function* streamAssistantResponse(
  chat: Awaited<ReturnType<typeof requireChat>>,
  requestId: string,
  provider?: string,
  includeChatId = false,
): AsyncGenerator<StreamPayload> {
  const aiProvider = aiService.getProvider(provider);
  const providerName = aiProvider.getProviderName();
  const chatId = getChatId(chat);
  const promptMessages = getLimitedMessages(chat.messages as ChatMessage[]);
  const assistantMessage = createAssistantMessage(
    "",
    providerName,
    requestId,
    "streaming",
  );

  chat.messages.push(assistantMessage as any);
  await chat.save();

  const persistedAssistantMessage = getAssistantMessageByRequestId(chat, requestId);

  const activeStream = chatStreamRegistry.create({
    requestId,
    chatId,
    messageId: persistedAssistantMessage?.id || "",
    model: providerName,
  });

  yield includeChatId
    ? { chatId, requestId, model: providerName, status: "streaming" }
    : { requestId, model: providerName, status: "streaming" };

  try {
    const stream = aiProvider.generateStreamResponse(
      promptMessages,
      activeStream.abortController.signal,
    );

    let fullResponse = "";

    for await (const chunk of stream) {
      if (activeStream.abortController.signal.aborted) {
        break;
      }

      fullResponse += chunk;
      if (persistedAssistantMessage) {
        persistedAssistantMessage.content = fullResponse;
        persistedAssistantMessage.status = "streaming";
      }
      chatStreamRegistry.updateResponse(requestId, fullResponse, chunk);
      yield { chunk, requestId, status: "streaming" };
    }

    if (persistedAssistantMessage) {
      persistedAssistantMessage.content = fullResponse;
      persistedAssistantMessage.status = activeStream.abortController.signal.aborted
        ? "stopped"
        : "completed";
      persistedAssistantMessage.model = providerName;
    }
    await chat.save();

    if (activeStream.abortController.signal.aborted) {
      yield { done: true, chatId, requestId, status: "stopped" };
      return;
    }

    chatStreamRegistry.complete(requestId);
    yield { done: true, chatId, requestId, status: "completed" };
  } catch (aiError) {
    if (activeStream.abortController.signal.aborted) {
      if (persistedAssistantMessage) {
        persistedAssistantMessage.content = activeStream.fullResponse;
        persistedAssistantMessage.status = "stopped";
      }
      await chat.save();
      yield { done: true, chatId, requestId, status: "stopped" };
      return;
    }

    console.error("AI Error in chat stream:", aiError);
    chatStreamRegistry.fail(requestId, "AI failed to respond");
    yield { error: "AI failed to respond, but your message was saved." };
  }
}

export const chatService = {
  async createChat({ userId, message, provider }: CreateChatInput) {
    const resolvedUserId = requireUserId(userId);
    const trimmedMessage = message?.trim();
    const messages: ChatMessage[] = [];

    if (trimmedMessage) {
      messages.push(createUserMessage(trimmedMessage, provider));

      const aiProvider = aiService.getProvider(provider);
      const providerName = aiProvider.getProviderName();
      const reply = await aiProvider.generateResponse(getLimitedMessages(messages));

      messages.push(createAssistantMessage(reply, providerName));
    }

    const chat = chatRepository.create({
      userId: resolvedUserId,
      title: createTitle(trimmedMessage),
      messages,
    });

    await chat.save();
    return chat;
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
      messages: [createUserMessage(trimmedMessage, input.provider)],
    });

    await chat.save();

    yield* streamAssistantResponse(chat as any, requestId, input.provider, true);
  },

  async sendMessage({ chatId, message, provider }: SendMessageInput) {
    const trimmedMessage = requireMessage(message);
    const chat = await requireChat(chatId);

    chat.messages.push(createUserMessage(trimmedMessage, provider) as any);

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = createTitle(trimmedMessage);
    }

    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();
    const reply = await aiProvider.generateResponse(
      getLimitedMessages(chat.messages as ChatMessage[]),
    );

    chat.messages.push(createAssistantMessage(reply, providerName) as any);
    await chat.save();

    return chat;
  },

  async *streamMessage({
    chatId,
    message,
    provider,
    requestId,
  }: SendMessageInput) {
    const trimmedMessage = requireMessage(message);
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);

    chat.messages.push(createUserMessage(trimmedMessage, provider) as any);

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = createTitle(trimmedMessage);
    }

    await chat.save();

    yield* streamAssistantResponse(chat, resolvedRequestId, provider);
  },

  async stopStream({ requestId, chatId }: StopStreamInput) {
    const resolvedRequestId = requireRequestId(requestId);
    const activeStream = chatStreamRegistry.get(resolvedRequestId);

    if (activeStream) {
      const chat = await requireChat(activeStream.chatId);
      const assistantMessage =
        getAssistantMessageByRequestId(chat, resolvedRequestId);

      if (assistantMessage) {
        assistantMessage.content = activeStream.fullResponse;
        assistantMessage.status = "stopped";
        await chat.save();
      }

      chatStreamRegistry.stop(resolvedRequestId);
      return {
        stopped: true,
        chatId: activeStream.chatId,
        requestId: resolvedRequestId,
      };
    }

    if (chatId) {
      const chat = await requireChat(chatId);
      const assistantMessage =
        getAssistantMessageByRequestId(chat, resolvedRequestId);

      if (assistantMessage && assistantMessage.status === "streaming") {
        assistantMessage.status = "stopped";
        await chat.save();
      }
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
};
