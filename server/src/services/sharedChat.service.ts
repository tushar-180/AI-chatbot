import { SharedChat } from "../models/SharedChat.model";
import { chatRepository } from "../repositories/chat.repository";

export const sharedChatService = {
  async shareChat(chatId: string, userId: string) {
    const originalChat = await chatRepository.findById(chatId);

    if (!originalChat) {
      const error = new Error("Chat not found");
      (error as any).name = "NotFoundError";
      throw error;
    }

    if (originalChat.userId !== userId) {
      const error = new Error("Unauthorized: You do not own this chat");
      (error as any).name = "ForbiddenError";
      throw error;
    }

    const messagesSnapshot = originalChat.messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }));

    let sharedChat = await SharedChat.findOne({ originalChatId: chatId });

    if (sharedChat) {
      (sharedChat as any).messages = messagesSnapshot;
      sharedChat.title = originalChat.title;
      await sharedChat.save();
    } else {
      sharedChat = await SharedChat.create({
        originalChatId: chatId,
        userId: userId,
        title: originalChat.title,
        messages: messagesSnapshot,
      });
    }

    const serverUrl =
      process.env.CLIENT_URL ||
      process.env.CLIENT_DEV ||
      "http://localhost:5173";
    const url = `${serverUrl}/shared/${sharedChat._id}`;

    return {
      success: true,
      sharedChatId: sharedChat._id,
      url,
    };
  },

  async getSharedChat(sharedChatId: string) {
    const sharedChat = await SharedChat.findById(sharedChatId).lean();

    if (!sharedChat) {
      const error = new Error("Shared chat not found");
      (error as any).name = "NotFoundError";
      throw error;
    }

    return {
      title: sharedChat.title,
      messages: sharedChat.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      })),
    };
  },

  async forkSharedChat(sharedChatId: string, userId: string) {
    const sharedChat = await SharedChat.findById(sharedChatId).lean();

    if (!sharedChat) {
      const error = new Error("Shared chat not found");
      (error as any).name = "NotFoundError";
      throw error;
    }

    // Create a new chat for the user
    const newChat = chatRepository.create({
      userId,
      title: sharedChat.title,
    });
    await newChat.save();

    const newChatId = newChat._id.toString();

    // Copy shared messages into the new chat
    for (const msg of sharedChat.messages) {
      await chatRepository.saveMessage(newChatId, {
        role: msg.role as any,
        userId,
        content: msg.content,
        status: "completed",
      });
    }

    return { newChatId };
  },
};
