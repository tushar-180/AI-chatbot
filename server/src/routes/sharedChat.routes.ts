import { Router } from "express";
import * as SharedChatController from "../controllers/sharedChat.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// Share a chat
router.post("/:chatId/share", requireAuth, SharedChatController.shareChat);

// Get user's shared chats list
router.get("/user/shares", requireAuth, SharedChatController.getUserSharedChats);

// Get public shared chat (public)
router.get("/:sharedChatId", SharedChatController.getSharedChat);

// Delete shared chat
router.delete("/:sharedChatId", requireAuth, SharedChatController.deleteSharedChat);

// Fork shared chat into user's own chat
router.post("/:sharedChatId/fork", requireAuth, SharedChatController.forkSharedChat);

export default router;
