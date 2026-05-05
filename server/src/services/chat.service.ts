import {
  CHAT_TITLE_MAX_LENGTH,
  DEFAULT_AI_PROVIDER,
  DEFAULT_CHAT_TITLE,
} from "../constants/chat.constants";
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
import { aiService } from "./ai.service";
import { chatStreamRegistry } from "./chatStreamRegistry.service";

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
): ChatMessage => ({
  role: "assistant",
  userId,
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
  
  // Create assistant message in its own collection
  const assistantMessageDoc = await chatRepository.saveMessage(chatId, {
    role: "assistant",
    userId: chat.userId,
    content: "",
    model: providerName,
    requestId,
    status: "streaming",
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
      chatStreamRegistry.updateResponse(requestId, fullResponse, chunk);
      yield { chunk, requestId, status: "streaming" };
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
    });

    if (activeStream.abortController.signal.aborted) {
      yield { done: true, chatId, requestId, status: "stopped" };
      return;
    }

    chatStreamRegistry.complete(requestId);
    yield { done: true, chatId, requestId, status: "completed" };
  } catch (aiError) {
    if (activeStream.abortController.signal.aborted) {
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
    chatStreamRegistry.fail(requestId, "AI failed to respond");
    yield { error: "AI failed to respond, but your message was saved." };
  }
}


export const chatService = {
  async createChat({ userId, message, provider, attachments }: CreateChatInput) {
    const resolvedUserId = requireUserId(userId);
    const trimmedMessage = message?.trim();

    const chat = chatRepository.create({
      userId: resolvedUserId,
      title: createTitle(trimmedMessage),
    });

    await chat.save();
    const chatId = chat._id.toString();

    if (trimmedMessage || (attachments && attachments.length > 0)) {
      // Save User Message
      const userMessage = createUserMessage(trimmedMessage || "", String(resolvedUserId), provider, attachments);
      await chatRepository.saveMessage(chatId, userMessage);

      const aiProvider = aiService.getProvider(provider);
      const providerName = aiProvider.getProviderName();
      
      // Get history for context
      const messages = [userMessage];
      const reply = await aiProvider.generateResponse(
        getLimitedMessages(messages),
      );

      // Parse multimedia from reply
      const { attachments: aiAttachments, type } = parseMultimedia(reply);

      // Save Assistant Message
      await chatRepository.saveMessage(chatId, {
        ...createAssistantMessage(reply, String(resolvedUserId), providerName),
        attachments: aiAttachments,
        type: type as any,
      });
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
    await chatRepository.saveMessage(chatId, createUserMessage(trimmedMessage, String(resolvedUserId), input.provider, input.attachments));

    // Refetch to get messages for prompt
    const fullChat = await chatRepository.findById(chatId);

    yield* streamAssistantResponse(
      fullChat as any,
      requestId,
      input.provider,
      true,
    );
  },

  async sendMessage({ chatId, message, provider, attachments }: SendMessageInput) {
    const trimmedMessage = message?.trim() || "";
    const chat = await requireChat(chatId);

    // Save User Message
    await chatRepository.saveMessage(chatId, createUserMessage(trimmedMessage, String(chat.userId), provider, attachments));

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = createTitle(trimmedMessage);
      await (chat as any).save();
    }

    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();
    
    // Fetch updated history
    const updatedChat = await chatRepository.findById(chatId);
    const reply = await aiProvider.generateResponse(
      getLimitedMessages(updatedChat?.messages as ChatMessage[]),
    );

    // Parse multimedia from reply
    const { attachments: aiAttachments, type } = parseMultimedia(reply);

    // Save Assistant Message
    await chatRepository.saveMessage(chatId, {
      ...createAssistantMessage(reply, String(chat.userId), providerName),
      attachments: aiAttachments,
      type: type as any,
    });
    
    return await chatRepository.findById(chatId);
  },

  async *streamMessage({
    chatId,
    message,
    provider,
    requestId,
    attachments,
  }: SendMessageInput) {
    const trimmedMessage = message?.trim() || "";
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);

    // Save User Message
    await chatRepository.saveMessage(chatId, createUserMessage(trimmedMessage, String(chat.userId), provider, attachments));

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = createTitle(trimmedMessage);
      await (chat as any).save();
    }

    // Refresh chat to include new user message
    const updatedChat = await chatRepository.findById(chatId);

    yield* streamAssistantResponse(updatedChat as any, resolvedRequestId, provider);
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
          createdAt: (msg as any).createdAt
        });
      }
    }
    
    return gallery;
  }
};
