"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserMemory = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userMemorySchema = new mongoose_1.default.Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    content: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        enum: ["preference", "personal", "technical", "work", "general"],
        default: "general",
    },
    importance: {
        type: Number,
        default: 1,
        min: 1,
        max: 5,
    },
    metadata: {
        type: mongoose_1.default.Schema.Types.Mixed,
        default: {},
    },
    embedding: {
        type: [Number],
        index: false, // Vector indexes are created via Atlas UI/API, not standard Mongoose index
    },
}, { timestamps: true });
exports.UserMemory = mongoose_1.default.model("UserMemory", userMemorySchema);
