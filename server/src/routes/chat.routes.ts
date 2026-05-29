import { Router } from "express";
import * as ChatController from "../controllers/chat.controller";

import multer from "multer";
import os from "node:os";

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// Create new chat
router.post("/", upload.single('file'), ChatController.createChat);
router.post("/stream", upload.single('file'), ChatController.createChatStream);
router.post("/stop", ChatController.stopStream);

// Add message to existing chat
router.post("/:id", upload.single('file'), ChatController.sendMessage);
router.post("/:id/stream", upload.single('file'),ChatController.streamMessage);
router.get("/:id/stream-updates", ChatController.getStreamUpdates);

// Get All Chats
router.get("/", ChatController.getAllChats);

// Search Chats
router.get("/search", ChatController.searchChats);

// Get User Gallery
router.get("/gallery", ChatController.getGallery);

// Get single chat
router.get("/:id", ChatController.getChatById);

// Delete chat
router.delete("/:id", ChatController.deleteChat);

// Update chat title / project
router.patch("/:id", ChatController.updateChat);

// Move chat to project
router.patch("/:id/move", ChatController.moveChat);

// Archive chat
router.post("/:id/archive", ChatController.archiveChat);

// Unarchive chat
router.post("/:id/unarchive", ChatController.unarchiveChat);

// Pin chat
router.post("/:id/pin", ChatController.pinChat);

// Unpin chat
router.post("/:id/unpin", ChatController.unpinChat);

// Edit message
router.patch("/:id/messages/:messageId", upload.single('file'), ChatController.editMessage);
router.patch("/:id/messages/:messageId/stream", upload.single('file'), ChatController.streamEditMessage);

// Retry message
router.post("/:id/messages/:messageId/retry", ChatController.retryMessage);
router.post("/:id/messages/:messageId/retry/stream", ChatController.streamRetryMessage);

// Message Feedback
router.patch("/:id/messages/:messageId/feedback", ChatController.updateMessageFeedback);

// Branch / generation navigation
router.post("/branch/active", ChatController.setActiveBranch);
router.get("/:chatId/messages/:parentId/generations", ChatController.getMessageGenerations);

export default router;
