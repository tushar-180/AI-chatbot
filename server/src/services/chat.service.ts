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
});

const createAssistantMessage = (
  content: string,
  model: string,
): ChatMessage => ({
  role: "assistant",
  content,
  model,
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

const requireChat = async (chatId: string) => {
  const chat = await chatRepository.findById(chatId);

  if (!chat) {
    const error = new Error("Chat not found");
    error.name = "NotFoundError";
    throw error;
  }

  return chat;
};

async function* streamAssistantResponse(
  chat: Awaited<ReturnType<typeof requireChat>>,
  provider?: string,
  includeChatId = false,
): AsyncGenerator<StreamPayload> {
  const aiProvider = aiService.getProvider(provider);
  const providerName = aiProvider.getProviderName();
  const chatId = getChatId(chat);

  yield includeChatId
    ? { chatId, model: providerName }
    : { model: providerName };

  try {
    const stream = aiProvider.generateStreamResponse(
      getLimitedMessages(chat.messages as ChatMessage[]),
    );

    chatStreamRegistry.create(chatId, providerName);

    let fullResponse = "";

    for await (const chunk of stream) {
      fullResponse += chunk;
      chatStreamRegistry.updateResponse(chatId, fullResponse, chunk);
      yield { chunk };
    }

    chat.messages.push(createAssistantMessage(fullResponse, providerName) as any);
    await chat.save();

    chatStreamRegistry.complete(chatId);
    yield { done: true, chatId };
  } catch (aiError) {
    console.error("AI Error in chat stream:", aiError);
    chatStreamRegistry.fail(chatId, "AI failed to respond");
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

    const chat = chatRepository.create({
      userId: resolvedUserId,
      title: createTitle(trimmedMessage),
      messages: [createUserMessage(trimmedMessage, input.provider)],
    });

    await chat.save();

    yield* streamAssistantResponse(chat as any, input.provider, true);
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

  async *streamMessage({ chatId, message, provider }: SendMessageInput) {
    const trimmedMessage = requireMessage(message);
    const chat = await requireChat(chatId);

    chat.messages.push(createUserMessage(trimmedMessage, provider) as any);

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = createTitle(trimmedMessage);
    }

    await chat.save();

    yield* streamAssistantResponse(chat, provider);
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
};
