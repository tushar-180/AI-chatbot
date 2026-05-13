import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sharedChatService } from "../services/sharedChat.service";

const sendControllerError = (res: Response, error: any, fallbackMessage: string) => {
  if (error?.name === "NotFoundError") {
    return res.status(404).json({ error: error.message });
  }
  if (error?.name === "ForbiddenError") {
    return res.status(403).json({ error: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
};

export const shareChat = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID is required" });
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
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID is required" });
    }

    const sharedChatId = req.params.sharedChatId as string;
    const result = await sharedChatService.forkSharedChat(sharedChatId, userId);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fork shared chat");
  }
});
