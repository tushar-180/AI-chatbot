import { Router } from "express";
import * as SharedChatController from "../controllers/sharedChat.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// Share a chat
router.post("/:chatId/share", requireAuth, SharedChatController.shareChat);

// Get public shared chat (public)
router.get("/:sharedChatId", SharedChatController.getSharedChat);

// Fork shared chat into user's own chat
router.post("/:sharedChatId/fork", requireAuth, SharedChatController.forkSharedChat);

export default router;
