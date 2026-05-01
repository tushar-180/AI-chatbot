import { Chat } from "../models/Chat.model";
import type { ChatMessage } from "../types/chat.types";

export const chatRepository = {
  create(data: { userId: string; title: string; messages: ChatMessage[] }) {
    return new Chat(data);
  },

  findById(chatId: string) {
    return Chat.findById(chatId);
  },

  findAllByUserId(userId: string) {
    return Chat.find({ userId }).select("-messages").sort({ updatedAt: -1 });
  },

  deleteById(chatId: string) {
    return Chat.findByIdAndDelete(chatId);
  },
};
