import { Router } from "express";
import * as ChatController from "../controllers/chat.controller";

const router = Router();

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
router.patch("/:id/messages/:messageId", ChatController.editMessage);
router.patch("/:id/messages/:messageId/stream", ChatController.streamEditMessage);

// Retry message
router.post("/:id/messages/:messageId/retry", ChatController.retryMessage);
router.post("/:id/messages/:messageId/retry/stream", ChatController.streamRetryMessage);

// Message Feedback
router.patch("/:id/messages/:messageId/feedback", ChatController.updateMessageFeedback);

export default router;
