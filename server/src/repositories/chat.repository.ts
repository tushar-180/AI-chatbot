import { Chat, Message, TokenUsageRecord } from "../models/Chat.model";
import type { ChatMessage } from "../types/chat.types";
import mongoose from "mongoose";

export const chatRepository = {
  async touchChat(chatId: string) {
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        $set: { updatedAt: new Date() },
      },
      { new: true },
    );

    if (chat && chat.projectId) {
      const { projectRepository } = require("./project.repository");
      await projectRepository.touchProject(chat.projectId.toString());
    }
    return chat;
  },

  create(data: {
    userId: string;
    title: string;
    projectId?: string;
    isSidebarVisible?: boolean;
  }) {
    return new Chat(data);
  },

  async findById(chatId: string) {
    const chat = await Chat.findById(chatId);
    if (!chat) return null;

    // Fetch messages from the new Message collection
    const messages = await Message.find({ chatId }).sort({ createdAt: 1 });

    // Combine legacy messages (if any) with new messages
    const legacyMessagesRaw =
      (chat.toObject() as any).messages ||
      (chat.toObject() as any).legacyMessages ||
      [];

    const legacyMessages = legacyMessagesRaw.map((m: any) => ({
      ...m,
      id: String(m._id || m.id || m.requestId || ""),
    }));

    // Convert Mongoose documents to objects and add 'id' field for frontend consistency
    const formattedMessages = messages.map((msg) => ({
      ...msg.toObject(),
      id: msg._id.toString(),
    }));

    // Reconstruct the chat object for the service
    const chatObj = chat.toObject();
    return {
      ...chatObj,
      messages: [...legacyMessages, ...formattedMessages],
      save: () => chat.save(), // Allow the service to call .save() for title updates
    };
  },

  findAllByUserId(
    userId: string,
    page: number = 1,
    limit: number = 20,
    isArchived: boolean = false,
  ) {
    const skip = (page - 1) * limit;
    const query = isArchived
      ? {
          userId,
          isArchived: true,
          isSidebarVisible: { $ne: false },
          $or: [{ projectId: null }, { projectId: { $exists: false } }],
        }
      : {
          userId,
          isArchived: { $ne: true },
          isSidebarVisible: { $ne: false },
          $or: [{ projectId: null }, { projectId: { $exists: false } }],
        };

    return Chat.find(query)
      .select("-messages -legacyMessages")
      .sort({ isPinned: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);
  },

  findAllByProjectAndUser(projectId: string, userId: string) {
    return Chat.find({ projectId, userId })
      .select("-messages -legacyMessages")
      .sort({ updatedAt: -1 });
  },

  moveToProject(chatId: string, userId: string, projectId: string) {
    return Chat.findOneAndUpdate(
      { _id: chatId, userId },
      { projectId },
      { new: true },
    );
  },

  async searchChats(userId: string, query: string) {
    try {
      // First, try searching for chats by title
      const chatResults = await Chat.find({
        userId,
        title: { $regex: query, $options: "i" },
      })
        .select("-messages -legacyMessages")
        .limit(10)
        .lean();

      // Second, search in messages content
      const messageResults = await Message.find({
        userId,
        content: { $regex: query, $options: "i" },
      })
        .limit(20)
        .lean();

      const resultsMap = new Map<string, any>();

      // Add chat results
      chatResults.forEach((chat) => {
        resultsMap.set(String(chat._id), {
          ...chat,
          matchType: "title",
          snippet: "",
        });
      });

      // Add message results (overwriting or adding snippet)
      for (const msg of messageResults) {
        const chatId = String(msg.chatId);
        const existing = resultsMap.get(chatId);

        const content = msg.content || "";
        const index = content.toLowerCase().indexOf(query.toLowerCase());
        const start = Math.max(0, index - 40);
        const end = Math.min(content.length, index + 60);
        const snippet =
          (start > 0 ? "..." : "") +
          content.substring(start, end) +
          (end < content.length ? "..." : "");

        if (existing) {
          existing.matchType = "content";
          existing.snippet = snippet;
        } else {
          const chat = await Chat.findById(chatId)
            .select("-messages -legacyMessages")
            .lean();
          if (chat && String(chat.userId) === userId) {
            resultsMap.set(chatId, {
              ...chat,
              matchType: "content",
              snippet: snippet,
            });
          }
        }
      }

      const finalResults = Array.from(resultsMap.values()).sort(
        (a, b) =>
          new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf(),
      );

      return finalResults;
    } catch (err) {
      console.error("Search failed:", err);
      return [];
    }
  },

  async deleteById(chatId: string) {
    const chat = await Chat.findByIdAndDelete(chatId);
    if (chat) {
      await Message.deleteMany({ chatId });
    }
    return chat;
  },

  async deleteManyByProjectId(projectId: string) {
    const chats = await Chat.find({ projectId }).select("_id");
    const chatIds = chats.map((chat) => chat._id);

    if (chatIds.length > 0) {
      await Message.deleteMany({ chatId: { $in: chatIds } });
      await Chat.deleteMany({ _id: { $in: chatIds } });
    }

    return chatIds.length;
  },

  async saveMessage(chatId: string, messageData: Partial<ChatMessage>) {
    const message = await Message.create({
      chatId,
      userId: messageData.userId,
      ...messageData,
    });

    if (messageData.tokens) {
      await TokenUsageRecord.findOneAndUpdate(
        { messageId: message._id },
        {
          userId: message.userId,
          chatId: message.chatId,
          role: message.role,
          model: message.model,
          tokens: messageData.tokens,
        },
        { upsert: true, new: true }
      );

      const chat = await Chat.findByIdAndUpdate(
        chatId,
        {
          $inc: {
            "tokens.promptTokens": messageData.tokens.promptTokens || 0,
            "tokens.completionTokens": messageData.tokens.completionTokens || 0,
            "tokens.totalTokens": messageData.tokens.totalTokens || 0,
          },
          $set: { updatedAt: new Date() },
        },
        { new: true },
      );

      if (chat && chat.projectId) {
        const { projectRepository } = require("./project.repository");
        await projectRepository.touchProject(chat.projectId.toString());
      }
    } else {
      await this.touchChat(chatId);
    }

    return message;
  },
  async updateMessageInternal(query: any, updateData: Partial<ChatMessage>) {
    // Read existing message first
    const existingMessage = await Message.findOne(query);

    // Merge metadata safely to preserve old fields
    if (updateData.metadata) {
      let existingMetadata = {};

      if (existingMessage?.metadata) {
        existingMetadata =
          typeof existingMessage.metadata.toObject === "function"
            ? existingMessage.metadata.toObject()
            : JSON.parse(JSON.stringify(existingMessage.metadata));
      }

      updateData.metadata = {
        ...existingMetadata,
        ...updateData.metadata,
      };
    }

    // Update message
    const message = await Message.findOneAndUpdate(query, updateData, {
      returnDocument: "after",
    });

    // No message found
    if (!message) {
      const searchKey = query._id ? "messages._id" : (query.requestId ? "messages.requestId" : null);
      const searchValue = query._id || query.requestId;
      if (searchKey && searchValue) {
        const chatDoc = await Chat.findOne({ [searchKey]: searchValue });
        if (chatDoc) {
          let legacyMsg: any = null;
          const legacyMsgs = (chatDoc as any).messages || [];
          for (const m of legacyMsgs) {
            const matches = query._id
              ? String(m._id) === String(searchValue)
              : String(m.requestId) === String(searchValue);
            if (matches) {
              if (updateData.metadata) {
                const existingMetadata = m.metadata || {};
                updateData.metadata = {
                  ...existingMetadata,
                  ...updateData.metadata,
                };
              }
              for (const [key, val] of Object.entries(updateData)) {
                m[key] = val;
              }
              legacyMsg = {
                ...(m.toObject ? m.toObject() : m),
                id: String(m._id),
                _id: m._id,
                chatId: String(chatDoc._id),
              };
              break;
            }
          }
          if (legacyMsg) {
            chatDoc.markModified("messages");
            await chatDoc.save();
            return legacyMsg;
          }
        }
      }
      return null;
    }

    if (message?.chatId && updateData.tokens) {
      await TokenUsageRecord.findOneAndUpdate(
        { messageId: message._id },
        {
          userId: message.userId,
          chatId: message.chatId,
          role: message.role,
          model: message.model,
          tokens: updateData.tokens,
        },
        { upsert: true, new: true }
      );

      // Calculate the delta: new tokens minus old tokens (to avoid double-counting on retries)
      const oldTokens = existingMessage?.tokens;

      // Calculate token deltas
      const deltaPrompt =
        (updateData.tokens.promptTokens || 0) - (oldTokens?.promptTokens || 0);

      const deltaCompletion =
        (updateData.tokens.completionTokens || 0) -
        (oldTokens?.completionTokens || 0);

      const deltaTotal =
        (updateData.tokens.totalTokens || 0) - (oldTokens?.totalTokens || 0);

      // Only update chat if values changed
      if (deltaPrompt !== 0 || deltaCompletion !== 0 || deltaTotal !== 0) {
        const chat = await Chat.findByIdAndUpdate(
          String(message.chatId),
          {
            $inc: {
              "tokens.promptTokens": deltaPrompt,
              "tokens.completionTokens": deltaCompletion,
              "tokens.totalTokens": deltaTotal,
            },
            $set: {
              updatedAt: new Date(),
            },
          },
          { new: true },
        );

        // Touch project if exists
        if (chat?.projectId) {
          const { projectRepository } = require("./project.repository");

          await projectRepository.touchProject(chat.projectId.toString());
        }
      } else {
        // No token changes, still refresh chat timestamp
        await this.touchChat(String(message.chatId));
      }
    } else if (message.chatId) {
      // No tokens but still refresh chat activity
      await this.touchChat(String(message.chatId));
    }

    return message;
  },

  async updateMessage(messageId: string, updateData: Partial<ChatMessage>) {
    // Try Mongo _id first
    let message = await this.updateMessageInternal(
      { _id: messageId },
      updateData,
    );

    // Fallback to requestId
    if (!message) {
      message = await this.updateMessageInternal(
        { requestId: messageId },
        updateData,
      );
    }

    return message;
  },

  async updateMessageByRequestId(
    chatId: string | null | undefined,
    requestId: string,
    updateData: Partial<ChatMessage>,
  ) {
    const query =
      chatId && chatId !== "null" ? { chatId, requestId } : { requestId };
    // Read existing message to get old token values for delta calculation
    const existingMessage = await Message.findOne(query);

    const message = await Message.findOneAndUpdate(query, updateData, {
      returnDocument: "after",
    });
    if (message?.chatId && updateData.tokens) {
      await TokenUsageRecord.findOneAndUpdate(
        { messageId: message._id },
        {
          userId: message.userId,
          chatId: message.chatId,
          role: message.role,
          model: message.model,
          tokens: updateData.tokens,
        },
        { upsert: true, new: true }
      );

      // Calculate delta: new tokens minus old tokens
      const oldTokens = existingMessage?.tokens;
      const deltaPrompt =
        (updateData.tokens.promptTokens || 0) - (oldTokens?.promptTokens || 0);
      const deltaCompletion =
        (updateData.tokens.completionTokens || 0) -
        (oldTokens?.completionTokens || 0);
      const deltaTotal =
        (updateData.tokens.totalTokens || 0) - (oldTokens?.totalTokens || 0);

      if (deltaPrompt !== 0 || deltaCompletion !== 0 || deltaTotal !== 0) {
        const chat = await Chat.findByIdAndUpdate(
          String(message.chatId),
          {
            $inc: {
              "tokens.promptTokens": deltaPrompt,
              "tokens.completionTokens": deltaCompletion,
              "tokens.totalTokens": deltaTotal,
            },
            $set: { updatedAt: new Date() },
          },
          { new: true },
        );

        if (chat && chat.projectId) {
          const { projectRepository } = require("./project.repository");
          await projectRepository.touchProject(chat.projectId.toString());
        }
      } else {
        await this.touchChat(String(message.chatId));
      }
    } else if (message?.chatId) {
      await this.touchChat(String(message.chatId));
    }
    return message;
  },

  async deleteMessagesAfter(chatId: string, messageId: string) {
    const message = await Message.findById(messageId);
    if (!message) return;

    await Message.deleteMany({
      chatId,
      createdAt: { $gt: message.createdAt },
    });
    await this.touchChat(chatId);
  },

  /**
   * Mark a single message by id as active and deactivate all other messages
   * in the same branchId group within the given chat.
   * Used when the user navigates between retry/edit generations.
   */
  async setActiveBranchMessage(
    chatId: string,
    branchId: string,
    messageId: string,
  ) {
    // 1. Deactivate siblings in separate Message collection
    await Message.updateMany(
      { chatId, branchId, _id: { $ne: messageId } },
      { $set: { isActive: false } },
    );
    // Activate chosen one in separate Message collection
    const updatedMsg = await Message.findByIdAndUpdate(
      messageId,
      { $set: { isActive: true } },
      { new: true },
    );

    // 2. Also update legacy messages stored in the Chat document subdocument array (if any)
    const chatDoc = await Chat.findById(chatId);
    let legacyUpdatedMsg = null;
    if (chatDoc) {
      let updated = false;
      const legacyMsgs = (chatDoc as any).messages || [];
      for (const m of legacyMsgs) {
        const idStr = String(m._id || m.id);
        if (m.branchId === branchId) {
          m.isActive = (idStr === messageId);
          updated = true;
          if (idStr === messageId) {
            legacyUpdatedMsg = {
              ...(m.toObject ? m.toObject() : m),
              id: idStr,
              _id: m._id,
              chatId: String(chatDoc._id),
            };
          }
        }
      }
      if (updated) {
        chatDoc.markModified("messages");
        await chatDoc.save();
      }
    }

    return updatedMsg || legacyUpdatedMsg;
  },

  /**
   * Return a single message document by its _id.
   */
  async findMessageById(messageId: string) {
    const msg = await Message.findById(messageId);
    if (!msg) return null;
    return { ...msg.toObject(), id: msg._id.toString() };
  },

  /**
   * Return all assistant messages whose parentId equals the given user-message id.
   * Sorted by version ascending (version 1 = original).
   */
  async getMessagesByParentId(parentId: string) {
    const msgs = await Message.find({ parentId }).sort({ version: 1 }).lean();
    return msgs.map((m: any) => ({ ...m, id: m._id.toString() }));
  },

  /** Bulk-update messages matching filter. Used to deactivate branch siblings. */
  async updateMany(filter: Record<string, any>, update: Record<string, any>) {
    const res = await Message.updateMany(filter, { $set: update });

    // Also update legacy messages stored in Chat document subdocument array (if any)
    const chatId = filter.chatId;
    const branchId = filter.branchId;
    if (chatId) {
      const chatDoc = await Chat.findById(chatId);
      if (chatDoc) {
        let updated = false;
        const legacyMsgs = (chatDoc as any).messages || [];
        for (const m of legacyMsgs) {
          const matchesBranch = !branchId || m.branchId === branchId;
          if (matchesBranch) {
            for (const [key, val] of Object.entries(update)) {
              m[key] = val;
            }
            updated = true;
          }
        }
        if (updated) {
          chatDoc.markModified("messages");
          await chatDoc.save();
        }
      }
    }

    return res;
  },

  async update(chatId: string, data: any) {
    return await Chat.findByIdAndUpdate(chatId, data, { new: true });
  },

  async updateTitle(chatId: string, title: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { title } },
      { new: true },
    );
  },

  async findByShareId(shareId: string) {
    const chat = await Chat.findOne({ shareId });
    if (!chat) return null;

    const messages = await Message.find({ chatId: chat._id }).sort({
      createdAt: 1,
    });

    const formattedMessages = messages.map((msg) => ({
      ...msg.toObject(),
      id: msg._id.toString(),
    }));

    return {
      ...chat.toObject(),
      messages: formattedMessages,
    };
  },
  async archiveChat(chatId: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { isArchived: true } },
      { new: true },
    );
  },

  async unarchiveChat(chatId: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { isArchived: false } },
      { new: true },
    );
  },

  async pinChat(chatId: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { isPinned: true, updatedAt: new Date() } },
      { new: true },
    );
  },

  async unpinChat(chatId: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { isPinned: false, updatedAt: new Date() } },
      { new: true },
    );
  },

  async findAttachmentByHash(
    userId: string,
    fileHash: string,
  ): Promise<string | null> {
    // return the storagePath directly or null
    const message = await Message.findOne(
      {
        userId,
        "attachments.fileHash": fileHash,
        "attachments.storagePath": { $exists: true, $ne: "" },
      },
      { "attachments.$": 1 },
    )
      .lean()
      .exec();

    if (!message) return null;

    // message.attachments is an array with exactly one matching element
    const matchedAtt = (message as any).attachments?.[0];
    if (!matchedAtt || !matchedAtt.storagePath) return null;

    return matchedAtt.storagePath as string;
  },

  /**
   * Return an array of unique storage paths for all attachments in messages of a chat.
   */
  async getStoragePathsForChat(chatId: string): Promise<string[]> {
    const messages = await Message.find(
      {
        chatId,
        "attachments.storagePath": { $exists: true, $ne: "" },
      },
      { "attachments.storagePath": 1 },
    )
      .lean()
      .exec();

    const paths = new Set<string>();
    for (const msg of messages) {
      for (const att of (msg as any).attachments || []) {
        if (att.storagePath) paths.add(att.storagePath);
      }
    }
    return Array.from(paths);
  },

  /**
   * Check if a storage path is used in any other chat.
   */
  async countStoragePathUsages(
    chatIdToExclude: string,
    storagePath: string,
  ): Promise<number> {
    return await Message.countDocuments({
      chatId: { $ne: chatIdToExclude },
      "attachments.storagePath": storagePath,
    });
  },

  /**
   * Delete all messages belonging to a chat.
   */
  async deleteMessagesByChatId(chatId: string): Promise<void> {
    await Message.deleteMany({ chatId });
  },

  async findUserAttachments(userId: string) {
    return await Message.find({
      userId,
      attachments: { $exists: true, $not: { $size: 0 } },
    })
      .sort({ createdAt: -1 })
      .lean();
  },

  /**
   * Fetch recent messages from all chats within a project,
   * excluding the current chat. Used for cross-chat project memory.
   *
   * @param projectId  - The project to scope the query to
   * @param excludeChatId - The current chat to exclude (its messages are already in context)
   * @param messagesPerChat - How many recent messages to take from each sibling chat
   * @param maxChats  - Cap on how many sibling chats to include (most-recently-updated first)
   */
  async findRecentMessagesByProjectId(
    projectId: string,
    excludeChatId: string,
    messagesPerChat = 6,
    maxChats = 5,
  ): Promise<Array<{ chatTitle: string; messages: Array<{ role: string; content: string }> }>> {
    // 1. Find the most-recently-updated sibling chats
    const siblingChats = await Chat.find({
      projectId,
      _id: { $ne: excludeChatId },
    })
      .select("_id title")
      .sort({ updatedAt: -1 })
      .limit(maxChats)
      .lean();

    if (!siblingChats.length) return [];

    // 2. For each sibling chat, grab its last N user/assistant messages
    const results = await Promise.all(
      siblingChats.map(async (chat) => {
        const msgs = await Message.find({
          chatId: chat._id,
          role: { $in: ["user", "assistant"] },
          status: "completed",
        })
          .select("role content")
          .sort({ createdAt: -1 })
          .limit(messagesPerChat)
          .lean();

        // Reverse so they appear in chronological order
        const chronological = msgs.reverse().map((m) => ({
          role: m.role as string,
          content:
            typeof m.content === "string" && m.content.length > 800
              ? m.content.slice(0, 800) + "…"
              : (m.content as string) || "",
        }));

        return {
          chatTitle: (chat as any).title || "Untitled Chat",
          messages: chronological,
        };
      }),
    );

    // Only return chats that actually have messages
    return results.filter((r) => r.messages.length > 0);
  },
};
