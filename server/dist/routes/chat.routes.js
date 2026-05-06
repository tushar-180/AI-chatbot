"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ChatController = __importStar(require("../controllers/chat.controller"));
const router = (0, express_1.Router)();
// Create new chat
router.post("/", ChatController.createChat);
router.post("/stream", ChatController.createChatStream);
router.post("/stop", ChatController.stopStream);
// Add message to existing chat
router.post("/:id", ChatController.sendMessage);
router.post("/:id/stream", ChatController.streamMessage);
router.get("/:id/stream-updates", ChatController.getStreamUpdates);
// Get All Chats
router.get("/", ChatController.getAllChats);
// Get User Gallery
router.get("/gallery/:userId", ChatController.getGallery);
// Get single chat
router.get("/:id", ChatController.getChatById);
// Delete chat
router.delete("/:id", ChatController.deleteChat);
// Update chat title
router.patch("/:id", ChatController.updateChatTitle);
exports.default = router;
