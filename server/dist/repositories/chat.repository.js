"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatRepository = void 0;
const Chat_model_1 = require("../models/Chat.model");
exports.chatRepository = {
    create(data) {
        return new Chat_model_1.Chat(data);
    },
    findById(chatId) {
        return Chat_model_1.Chat.findById(chatId);
    },
    findAllByUserId(userId) {
        return Chat_model_1.Chat.find({ userId }).select("-messages").sort({ updatedAt: -1 });
    },
    deleteById(chatId) {
        return Chat_model_1.Chat.findByIdAndDelete(chatId);
    },
};
