"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
    clerkId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    firstName: {
        type: String,
    },
    lastName: {
        type: String,
    },
    imageUrl: {
        type: String,
    },
    lastSignInAt: {
        type: Date,
    },
    personalization: {
        customInstructions: { type: String, default: "" },
        nickname: { type: String, default: "" },
        occupation: { type: String, default: "" },
        tone: { type: String, default: "Default" },
    },
}, { timestamps: true });
exports.User = mongoose_1.default.model("User", userSchema);
