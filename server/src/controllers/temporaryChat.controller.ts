import { Request, Response } from "express";
import { temporaryChatService } from "../services/chat/temporaryChat.service";
import { pipeStreamResponse } from "../utils/sse";
import { chatStreamRegistry } from "../services/streams/streamRegistry.service";
import { parseRequestBody } from "../utils/requestParser";
import { sendStreamControllerError } from "../utils/controller";

export const createTemporaryChatStream = async (req: Request, res: Response) => {
  try {
    const rawMessages = req.body.messages;
    const messages = typeof rawMessages === "string" ? JSON.parse(rawMessages) : rawMessages;
    const { provider, requestId } = req.body;
    const userId = req.clerkId!;
    const parsed = parseRequestBody(req);

    await pipeStreamResponse(
      req,
      res,
      temporaryChatService.streamTemporaryChat({
        userId,
        messages,
        provider,
        requestId,
        webSearchEnabled: parsed.webSearchEnabled,
        attachedFile: parsed.attachedFile,
      }),
      () => {
        if (requestId) {
          chatStreamRegistry.stop(requestId);
        }
      }
    );
  } catch (error) {
    return sendStreamControllerError(res, error, "Failed to create temporary chat stream");
  }
};
