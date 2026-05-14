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

  findAllByUserId(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    return Chat.find({ userId })
      .select("-messages -legacyMessages")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
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
    await this.touchChat(chatId);
    return message;
  },

  async updateMessage(messageId: string, updateData: Partial<ChatMessage>) {
    const message = await Message.findByIdAndUpdate(messageId, updateData, {
      returnDocument: "after",
    });
    if (message?.chatId) {
      await this.touchChat(String(message.chatId));
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
    await this.touchChat(chatId);
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

  async update(chatId: string, data: Partial<{ title: string }>) {
    return await Chat.findByIdAndUpdate(chatId, data, { new: true })
  },

  async updateTitle(chatId: string, title: string) {
    return await Chat.findByIdAndUpdate(
      chatId,
      { $set: { title } },
      { new: true }
    );
  },
};
