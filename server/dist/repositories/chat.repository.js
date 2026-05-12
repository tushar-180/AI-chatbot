"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatRepository = void 0;
const Chat_model_1 = require("../models/Chat.model");
exports.chatRepository = {
    create(data) {
        return new Chat_model_1.Chat(data);
    },
    findById(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield Chat_model_1.Chat.findById(chatId);
            if (!chat)
                return null;
            // Fetch messages from the new Message collection
            const messages = yield Chat_model_1.Message.find({ chatId }).sort({ createdAt: 1 });
            // Combine legacy messages (if any) with new messages
            const legacyMessages = chat.toObject().messages ||
                chat.toObject().legacyMessages ||
                [];
            // Convert Mongoose documents to objects and add 'id' field for frontend consistency
            const formattedMessages = messages.map((msg) => (Object.assign(Object.assign({}, msg.toObject()), { id: msg._id.toString() })));
            // Reconstruct the chat object for the service
            const chatObj = chat.toObject();
            return Object.assign(Object.assign({}, chatObj), { messages: [...legacyMessages, ...formattedMessages], save: () => chat.save() });
        });
    },
    findAllByUserId(userId) {
        return Chat_model_1.Chat.find({ userId })
            .select("-messages -legacyMessages")
            .sort({ updatedAt: -1 });
    },
    deleteById(chatId) {
        return __awaiter(this, void 0, void 0, function* () {
            const chat = yield Chat_model_1.Chat.findByIdAndDelete(chatId);
            if (chat) {
                yield Chat_model_1.Message.deleteMany({ chatId });
            }
            return chat;
        });
    },
    saveMessage(chatId, messageData) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Chat_model_1.Message.create(Object.assign({ chatId, userId: messageData.userId }, messageData));
        });
    },
    updateMessage(messageId, updateData) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Chat_model_1.Message.findByIdAndUpdate(messageId, updateData, {
                returnDocument: "after",
            });
        });
    },
    findUserAttachments(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Chat_model_1.Message.find({
                userId,
                attachments: { $exists: true, $not: { $size: 0 } },
            })
                .sort({ createdAt: -1 })
                .lean();
        });
    },
    updateMessageByRequestId(chatId, requestId, updateData) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Chat_model_1.Message.findOneAndUpdate({ chatId, requestId }, updateData, {
                returnDocument: "after",
            });
        });
    },
};
