import { Chat, Message } from "../models/Chat.model";
import type { ChatMessage } from "../types/chat.types";

export const chatRepository = {
  async touchChat(chatId: string) {
    return await Chat.findByIdAndUpdate(chatId, {
      $set: { updatedAt: new Date() },
    });
  },

  create(data: { userId: string; title: string }) {
    return new Chat(data);
  },

  async findById(chatId: string) {
    const chat = await Chat.findById(chatId);
    if (!chat) return null;

    // Fetch messages from the new Message collection
    const messages = await Message.find({ chatId }).sort({ createdAt: 1 });

    // Combine legacy messages (if any) with new messages
    const legacyMessages =
      (chat.toObject() as any).messages ||
      (chat.toObject() as any).legacyMessages ||
      [];

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
      ? { userId, isArchived: true }
      : { userId, isArchived: { $ne: true } };

    return Chat.find(query)
      .select("-messages -legacyMessages")
      .sort({ isPinned: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);
  },

  async searchChats(userId: string, query: string) {
    try {
      // First, try searching for chats by title
      const chatResults = await Chat.find({
        userId,
        title: { $regex: query, $options: "i" }
      })
      .select("-messages -legacyMessages")
      .limit(10)
      .lean();

      // Second, search in messages content
      const messageResults = await Message.find({
        userId,
        content: { $regex: query, $options: "i" }
      })
      .limit(20)
      .lean();

      const resultsMap = new Map<string, any>();

      // Add chat results
      chatResults.forEach(chat => {
        resultsMap.set(String(chat._id), {
          ...chat,
          matchType: "title",
          snippet: ""
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
        const snippet = (start > 0 ? "..." : "") + content.substring(start, end) + (end < content.length ? "..." : "");

        if (existing) {
          existing.matchType = "content";
          existing.snippet = snippet;
        } else {
          const chat = await Chat.findById(chatId).select("-messages -legacyMessages").lean();
          if (chat && String(chat.userId) === userId) {
            resultsMap.set(chatId, {
              ...chat,
              matchType: "content",
              snippet: snippet
            });
          }
        }
      }

      const finalResults = Array.from(resultsMap.values()).sort((a, b) => 
        new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf()
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

  async saveMessage(chatId: string, messageData: Partial<ChatMessage>) {
    const message = await Message.create({
      chatId,
      userId: messageData.userId,
      ...messageData,
    });
    
    if (messageData.tokens) {
      await Chat.findByIdAndUpdate(chatId, {
        $inc: {
          "tokens.promptTokens": messageData.tokens.promptTokens || 0,
          "tokens.completionTokens": messageData.tokens.completionTokens || 0,
          "tokens.totalTokens": messageData.tokens.totalTokens || 0,
        },
        $set: { updatedAt: new Date() },
      });
    } else {
      await this.touchChat(chatId);
    }
    
    return message;
  },

  async updateMessage(messageId: string, updateData: Partial<ChatMessage>) {
    // Try to update by _id first, if that fails (e.g. it's a UUID), try by requestId
    let message = await Message.findByIdAndUpdate(messageId, updateData, {
      returnDocument: "after",
    });

    if (!message) {
      message = await Message.findOneAndUpdate(
        { requestId: messageId },
        updateData,
        { returnDocument: "after" },
      );
    }

    if (message?.chatId) {
      if (updateData.tokens) {
        await Chat.findByIdAndUpdate(String(message.chatId), {
          $inc: {
            "tokens.promptTokens": updateData.tokens.promptTokens || 0,
            "tokens.completionTokens": updateData.tokens.completionTokens || 0,
            "tokens.totalTokens": updateData.tokens.totalTokens || 0,
          },
          $set: { updatedAt: new Date() },
        });
      } else {
        await this.touchChat(String(message.chatId));
      }
    }
    return message;
  },

  async findUserAttachments(userId: string) {
    return await Message.find({
      userId,
      attachments: { $exists: true, $not: { $size: 0 } },
    })
      .sort({ createdAt: -1 })
      .lean();
  },

  async updateMessageByRequestId(
    chatId: string,
    requestId: string,
    updateData: Partial<ChatMessage>,
  ) {
    const message = await Message.findOneAndUpdate(
      { chatId, requestId },
      updateData,
      {
      returnDocument: "after",
      },
    );
    if (message?.chatId) {
      if (updateData.tokens) {
        await Chat.findByIdAndUpdate(String(message.chatId), {
          $inc: {
            "tokens.promptTokens": updateData.tokens.promptTokens || 0,
            "tokens.completionTokens": updateData.tokens.completionTokens || 0,
            "tokens.totalTokens": updateData.tokens.totalTokens || 0,
          },
          $set: { updatedAt: new Date() },
        });
      } else {
        await this.touchChat(String(message.chatId));
      }
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

  async update(chatId: string, data: any) {
    return await Chat.findByIdAndUpdate(chatId, data, { new: true });
  },

  async updateTitle(chatId: string, title: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { title } },
      { new: true }
    );
  },

  async findByShareId(shareId: string) {
    const chat = await Chat.findOne({ shareId });
    if (!chat) return null;

    const messages = await Message.find({ chatId: chat._id }).sort({ createdAt: 1 });
    
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
      { new: true }
    );
  },

  async unarchiveChat(chatId: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { isArchived: false } },
      { new: true }
    );
  },

  async pinChat(chatId: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { isPinned: true, updatedAt: new Date() } },
      { new: true }
    );
  },

  async unpinChat(chatId: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { isPinned: false, updatedAt: new Date() } },
      { new: true }
    );
  },
};
