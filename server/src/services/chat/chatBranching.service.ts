import { chatRepository } from "../../repositories/chat.repository";
import { aiService } from "../ai/ai.service";
import { buildPromptMessages } from "./promptBuilder.service";
import { streamAssistantResponse } from "./chatResponseHandler.service";
import { processAttachedFile } from "../../modules/file-rag/fileHandler";
import { buildGroundingMetadata, finalizeGroundedResponse } from "../../utils/webGrounding";
import { serializePromptMessages, calculateUsage } from "../../utils/tokenCounter";
import {
  nextVersionForParent,
  resolveActiveBranch,
  getContextBeforeMessage,
} from "../../utils/branchUtils";
import type { RawMessage } from "../../types/branch.types";
import { parseMultimedia } from "../../utils/chatHistory";
import { createTitle, resolveAssistantTokens, createAssistantMessage } from "./chat.service";
import { requireMessage, requireRequestId } from "../../utils/validation";
import { ChatMessage, EditMessageInput } from "../../types/chat.types";
import type { TokenUsage } from "../../types/token.types";

const requireChat = async (chatId: string) => {
  const chat = await chatRepository.findById(chatId);
  if (!chat) {
    const error = new Error("Chat not found");
    error.name = "NotFoundError";
    throw error;
  }
  return chat;
};

export const chatBranchingService = {
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

    let sharedBranchId = originalMsg.branchId ? String(originalMsg.branchId) : null;
    let parentId: string | undefined = undefined;

    if (originalMsg.parentId) {
      parentId = String(originalMsg.parentId);
    }

    if (sharedBranchId) {
      const siblingWithParent = allMessages.find(
        (m) => m.branchId === sharedBranchId && m.parentId
      );
      if (siblingWithParent) {
        parentId = String(siblingWithParent.parentId);
      }
    }

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

    let isFirstEdit = !isAlreadyBranched;
    if (isFirstEdit) {
      if (!sharedBranchId) {
        const { randomUUID } = await import("crypto");
        sharedBranchId = randomUUID();
      }
      await chatRepository.updateMessage(origId, {
        branchId: sharedBranchId,
        version: 1,
        isActive: false,
        parentId: parentId || undefined,
      } as any);
    } else {
      await chatRepository.updateMany({ chatId, branchId: sharedBranchId }, { isActive: false });
    }

    const siblings = allMessages.filter((m) => m.branchId === sharedBranchId || String(m._id) === origId);
    const userEditVersion = Math.max(...siblings.map((m) => m.version ?? 1), 1) + 1;

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
      parentId: parentId || undefined,
      editedFrom: messageId,
      branchId: sharedBranchId,
      version: userEditVersion,
      isActive: true,
    } as any);

    const newUserMsgId = String((newUserMsg as any)._id);

    const { randomUUID: assistantRandomUUID } = await import("crypto");
    const assistantBranchMeta = {
      parentId: newUserMsgId,
      editedFrom: messageId,
      branchId: assistantRandomUUID(),
      version: 1,
    };

    if (
      allMessages[0] &&
      (String(allMessages[0]._id) === resolvedMessageId ||
        allMessages[0].id === resolvedMessageId)
    ) {
      await chatRepository.update(chatId, { title: createTitle(trimmedMessage) });
    }

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
    const resolvedRequestId = requireRequestId(requestId);
    const chat = await requireChat(chatId);
    const allMessages = chat.messages as RawMessage[];

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

    const assistantIndex = allMessages.indexOf(assistantMessage);
    const parentId = assistantMessage.parentId
      ? String(assistantMessage.parentId)
      : String(
          allMessages
            .slice(0, assistantIndex >= 0 ? assistantIndex : undefined)
            .filter((m) => m.role === "user")
            .pop()?._id ?? ""
        );

    let sharedBranchId = assistantMessage.branchId ? String(assistantMessage.branchId) : null;
    if (!sharedBranchId) {
      const { randomUUID } = await import("crypto");
      sharedBranchId = randomUUID();
      await chatRepository.updateMessage(origId, {
        branchId: sharedBranchId,
        version: 1,
        isActive: false,
        parentId: parentId || undefined,
      } as any);
    } else {
      await chatRepository.updateMany({ chatId, branchId: sharedBranchId }, { isActive: false });
    }

    const siblings = allMessages.filter((m) => m.branchId === sharedBranchId || String(m._id) === origId);
    const nextVersion = Math.max(...siblings.map((m) => m.version ?? 1), 1) + 1;

    const contextMessages = getContextBeforeMessage(allMessages, origId);

    const branchMeta = {
      parentId,
      retryOf: origId,
      branchId: sharedBranchId,
      version: nextVersion,
    };

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
  }
};
