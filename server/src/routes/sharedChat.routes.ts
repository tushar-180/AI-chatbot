import { Router } from "express";
import * as SharedChatController from "../controllers/sharedChat.controller";

const router = Router();

// Share a chat (requires authentication via x-user-id header)
router.post("/:chatId/share", SharedChatController.shareChat);

// Get public shared chat (public)
router.get("/:sharedChatId", SharedChatController.getSharedChat);

// Fork shared chat into user's own chat (requires auth)
router.post("/:sharedChatId/fork", SharedChatController.forkSharedChat);

export default router;
