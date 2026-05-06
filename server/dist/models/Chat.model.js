"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = exports.Chat = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const messageSchema = new mongoose_1.default.Schema({
    chatId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "Chat",
        required: true,
        index: true,
    },
    userId: {
        type: String,
        required: true,
        index: true,
    },
    role: {
        type: String,
        enum: ["user", "assistant", "system"],
        required: true,
    },
    content: {
        type: String,
        default: "",
    },
    type: {
        type: String,
        enum: ["text", "image", "file", "action"],
        default: "text",
    },
    metadata: {
        type: mongoose_1.default.Schema.Types.Mixed,
        default: {},
    },
    attachments: [
        {
            url: String,
            name: String,
            mimeType: String,
            size: Number,
        },
    ],
    model: {
        type: String,
    },
    requestId: {
        type: String,
        index: true,
    },
    status: {
        type: String,
        enum: ["streaming", "stopped", "completed", "failed"],
        default: "completed",
        required: true,
    },
}, { timestamps: true });
const chatSchema = new mongoose_1.default.Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    title: {
        type: String,
        default: "New Chat",
    },
    // We keep this for backward compatibility during transition
    // but we will mainly use the Message collection.
    legacyMessages: {
        type: [mongoose_1.default.Schema.Types.Mixed],
        default: [],
    },
}, { timestamps: true });
exports.Chat = mongoose_1.default.model("Chat", chatSchema);
exports.Message = mongoose_1.default.model("Message", messageSchema);
