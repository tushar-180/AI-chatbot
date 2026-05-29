import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sharedChatService } from "../services/chat/sharedChat.service";
import { sendControllerError } from "../utils/controller";

export const shareChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const chatId = req.params.chatId as string;
    const result = await sharedChatService.shareChat(chatId, userId);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Failed to share chat");
  }
});

export const getSharedChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const sharedChatId = req.params.sharedChatId as string;
    const result = await sharedChatService.getSharedChat(sharedChatId);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fetch shared chat");
  }
});

export const forkSharedChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sharedChatId = req.params.sharedChatId as string;
    const result = await sharedChatService.forkSharedChat(sharedChatId, userId);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fork shared chat");
  }
});

export const getUserSharedChats = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await sharedChatService.getUserSharedChats(userId);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fetch user shared chats");
  }
});

export const deleteSharedChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sharedChatId = req.params.sharedChatId as string;
    const result = await sharedChatService.deleteSharedChat(sharedChatId, userId);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Failed to delete shared chat");
  }
});
