import { Chat, Message } from "../models/Chat.model";
import type { ChatMessage } from "../types/chat.types";

export const chatRepository = {
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

  findAllByUserId(userId: string) {
    return Chat.find({ userId })
      .select("-messages -legacyMessages")
      .sort({ updatedAt: -1 });
  },

  async deleteById(chatId: string) {
    const chat = await Chat.findByIdAndDelete(chatId);
    if (chat) {
      await Message.deleteMany({ chatId });
    }
    return chat;
  },

  async saveMessage(chatId: string, messageData: Partial<ChatMessage>) {
    return await Message.create({
      chatId,
      userId: messageData.userId,
      ...messageData,
    });
  },

  async updateMessage(messageId: string, updateData: Partial<ChatMessage>) {
    return await Message.findByIdAndUpdate(messageId, updateData, {
      returnDocument: "after",
    });
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
    return await Message.findOneAndUpdate({ chatId, requestId }, updateData, {
      returnDocument: "after",
    });
  },
};
