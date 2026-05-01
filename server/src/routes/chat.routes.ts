import { Router } from "express";
import * as ChatController from "../controllers/chat.controller";

const router = Router();

// Create new chat
router.post("/", ChatController.createChat);
router.post("/stream", ChatController.createChatStream);

// Add message to existing chat
router.post("/:id", ChatController.sendMessage);
router.post("/:id/stream", ChatController.streamMessage);
router.get("/:id/stream-updates", ChatController.getStreamUpdates);

// Get All Chats
router.get("/", ChatController.getAllChats);

// Get single chat
router.get("/:id", ChatController.getChatById);

// Delete chat
router.delete("/:id", ChatController.deleteChat);

export default router;
