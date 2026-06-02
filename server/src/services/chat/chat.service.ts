import {
  CHAT_TITLE_MAX_LENGTH,
  DEFAULT_AI_PROVIDER,
  DEFAULT_CHAT_TITLE,
} from "../../constants/chat.constants";
import { BASE_SYSTEM_PROMPT } from "../../constants/prompt.constants";
import { chatRepository } from "../../repositories/chat.repository";
import type {
  Attachment,
  ChatMessage,
  CreateChatInput,
  SendMessageInput,
  EditMessageInput,
  StopStreamInput,
  StreamPayload,
} from "../../types/chat.types";
import { getLimitedMessages, parseMultimedia } from "../../utils/chatHistory";
import {
  type WebGroundingContext,
  type SearchRejection,
  webSearchService,
} from "../../modules/web-search";
import { aiService } from "../ai/ai.service";
import { chatStreamRegistry } from "../streams/streamRegistry.service";
import { memoryService } from "../memory/memory.service";
import { userService } from "../user/user.service";
import { mcpClientService } from "../mcp/mcpClient.service";
import { getEnabledMcpTools } from "../mcp/mcpToolFilter.service";
import { buildGroundingMetadata, finalizeGroundedResponse } from "../../utils/webGrounding";
import {
  calculateUsage,
  estimateTokenCount,
  serializePromptMessages,
  logTokenUsage,
} from "../../utils/tokenCounter";
import type { TokenUsage } from "../../types/token.types";
import { requireUserId, requireMessage, requireRequestId } from "../../utils/validation";
import { buildProjectContext } from "../project/buildProjectContext";

import { parseFile } from "../../modules/file-rag/fileParser";
import { retrieveFileContext } from "../../modules/file-rag/fileRetrieval";
import { processAttachedFile, cleanupChatFiles } from "../../modules/file-rag/fileHandler";
import {
  nextVersionForParent,
  resolveActiveBranch,
  getContextBeforeMessage,
} from "../../utils/branchUtils";
import type { RawMessage } from "../../types/branch.types";
import { buildPromptMessages } from "./promptBuilder.service";
import { streamAssistantResponse } from "./chatResponseHandler.service";
import { chatBranchingService } from "./chatBranching.service";


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


export const createTitle = (message?: string) => {
  return message ? message.slice(0, CHAT_TITLE_MAX_LENGTH) : DEFAULT_CHAT_TITLE;
};

export const resolveAssistantTokens = (
  usage: TokenUsage | undefined,
  promptText: string,
  completionText: string,
  promptAttachmentCount = 0,
) => usage ?? calculateUsage(promptText, completionText, promptAttachmentCount);

export const createAssistantMessage = (
  content: string,
  userId: string,
  model?: string,
  requestId?: string,
  status: "streaming" | "stopped" | "completed" | "failed" = "completed",
  metadata?: any,
): ChatMessage => ({
  role: "assistant",
  userId,
  content,
  model,
  requestId,
  status,
  metadata,
});

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
        const attachedFileNames = promptMessages.flatMap((m) => m.attachments || []).map((a: any) => a.name || "");
        const latestUserMsgText = promptMessages.filter(m => m.role === 'user').pop()?.content || "";
        const tools = await getEnabledMcpTools(String(resolvedUserId), hasFiles, latestUserMsgText, attachedFileNames);
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

    // Resolve the parentId (the last active assistant message on the active branch path)
    const allMessages = chat.messages as RawMessage[];
    const activeMessages = resolveActiveBranch(allMessages);
    const lastActiveAssistant = [...activeMessages]
      .filter((m) => m.role === "assistant")
      .pop();
    const parentId = lastActiveAssistant
      ? String(lastActiveAssistant._id || lastActiveAssistant.id)
      : undefined;

    // Save User Message
    const userMsg = createUserMessage(
      trimmedMessage,
      String(chat.userId),
      provider,
      attachments,
    );
    userMsg.parentId = parentId;
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
    const savedUserMsg = await chatRepository.saveMessage(chatId, userMsg);

    if (!chat.title || chat.title === DEFAULT_CHAT_TITLE) {
      const newTitle = createTitle(trimmedMessage);
      await chatRepository.updateTitle(chatId, newTitle);
      chat.title = newTitle;
    }

    await aiService.validateModelAccess(provider);
    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();

    // Fetch updated history and resolve its active branch
    const updatedChat = await chatRepository.findById(chatId);
    const activeMessagesForPrompt = resolveActiveBranch(updatedChat?.messages as RawMessage[]) as any[] as ChatMessage[];
    const { promptMessages, webGrounding } = await buildPromptMessages(
      String(chat.userId),
      activeMessagesForPrompt,
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
      const attachedFileNames = promptMessages.flatMap((m) => m.attachments || []).map((a: any) => a.name || "");
      const latestUserMsgText = promptMessages.filter(m => m.role === 'user').pop()?.content || "";
      const tools = await getEnabledMcpTools(String(chat.userId), hasFiles, latestUserMsgText, attachedFileNames);
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
      parentId: savedUserMsg ? String(savedUserMsg._id || savedUserMsg.id) : undefined,
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

    // Resolve the parentId (the last active assistant message on the active branch path)
    const allMessages = chat.messages as RawMessage[];
    const activeMessages = resolveActiveBranch(allMessages);
    const lastActiveAssistant = [...activeMessages]
      .filter((m) => m.role === "assistant")
      .pop();
    const parentId = lastActiveAssistant
      ? String(lastActiveAssistant._id || lastActiveAssistant.id)
      : undefined;

    // Save User Message
    const userMsg = createUserMessage(
      trimmedMessage,
      String(chat.userId),
      provider,
      attachments,
    );
    userMsg.parentId = parentId;
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

  editMessage: chatBranchingService.editMessage,
  streamEditMessage: chatBranchingService.streamEditMessage,
  retryMessage: chatBranchingService.retryMessage,
  streamRetryMessage: chatBranchingService.streamRetryMessage,

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
