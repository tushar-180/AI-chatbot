import { Request, Response } from "express";
import { temporaryChatService } from "../services/chat/temporaryChat.service";
import { setSseHeaders, splitAndWriteChunk, writeSse, pipeStreamResponse } from "../utils/sse";
import { StreamPayload } from "../types/chat.types";
import { chatStreamRegistry } from "../services/streams/streamRegistry.service";
import { parseRequestBody } from "../utils/requestParser";

interface AuthenticatedRequest extends Request {
  clerkId?: string;
}


export const createTemporaryChatStream = async (req: AuthenticatedRequest, res: Response) => {
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
    console.error("Error in createTemporaryChatStream:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to create temporary chat stream" });
    } else {
      res.end();
    }
  }
};
