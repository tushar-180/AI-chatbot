import { Request, Response } from "express";
import { temporaryChatService } from "../services/temporaryChat.service";
import { setSseHeaders, splitAndWriteChunk, writeSse } from "../utils/sse";
import { StreamPayload } from "../types/chat.types";
import { chatStreamRegistry } from "../services/chatStreamRegistry.service";

interface AuthenticatedRequest extends Request {
  clerkId?: string;
}

const pipeStreamResponse = async (
  req: Request,
  res: Response,
  stream: AsyncGenerator<StreamPayload>,
  requestId?: string,
) => {
  const firstPayload = await stream.next();
  if (firstPayload.done) return;

  setSseHeaders(res);

  let clientDisconnected = false;
  req.on("close", () => {
    clientDisconnected = true;
    if (requestId) {
      chatStreamRegistry.stop(requestId);
    }
  });

  const writePayload = async (
    payload: Awaited<typeof firstPayload>["value"],
  ) => {
    if (clientDisconnected) return;

    if (payload.chunk) {
      await splitAndWriteChunk(res, payload.chunk, {
        requestId: payload.requestId,
        status: payload.status,
      });
    } else {
      writeSse(res, payload);
    }

    if (payload.done || payload.error) {
      res.end();
    }
  };

  await writePayload(firstPayload.value);

  for await (const payload of stream) {
    if (clientDisconnected) {
      break;
    }
    await writePayload(payload);
  }
};

export const createTemporaryChatStream = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messages, provider, requestId, webSearchEnabled } = req.body;
    const userId = req.clerkId!;

    await pipeStreamResponse(
      req,
      res,
      temporaryChatService.streamTemporaryChat({
        userId,
        messages,
        provider,
        requestId,
        webSearchEnabled,
      }),
      requestId,
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
