"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chat = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const messageSchema = new mongoose_1.default.Schema({
    id: {
        type: String,
        default: () => new mongoose_1.default.Types.ObjectId().toString(),
    },
    role: {
        type: String,
        enum: ["user", "assistant"],
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    model: {
        type: String,
    },
    requestId: {
        type: String,
    },
    status: {
        type: String,
        enum: ["streaming", "stopped", "completed"],
        default: "completed",
        required: true,
    },
});
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
    messages: [messageSchema],
}, { timestamps: true });
exports.Chat = mongoose_1.default.model("Chat", chatSchema);
