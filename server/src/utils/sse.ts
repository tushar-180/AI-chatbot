import type { Request, Response } from "express";
import type { StreamPayload } from "../types/chat.types";

export const setSseHeaders = (res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.socket?.setNoDelay(true);
  res.flushHeaders?.();
};

export const writeSse = (res: Response, payload: unknown) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  (res as Response & { flush?: () => void }).flush?.();
};

export const splitAndWriteChunk = async (
  res: Response,
  chunk: string,
  meta: Record<string, unknown> = {},
) => {
  if (chunk.length > 25) {
    const parts = chunk.split(/(\s+)/);

    for (const part of parts) {
      if (part) {
        writeSse(res, { ...meta, chunk: part });
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    }

    return;
  }

  writeSse(res, { ...meta, chunk });
};

export const pipeStreamResponse = async (
  req: Request,
  res: Response,
  stream: AsyncGenerator<StreamPayload>,
  onClientDisconnect?: () => void,
) => {
  const firstPayload = await stream.next();
  if (firstPayload.done) return;

  setSseHeaders(res);

  let clientDisconnected = false;
  req.on("close", () => {
    clientDisconnected = true;
    if (onClientDisconnect) {
      onClientDisconnect();
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
    if (clientDisconnected) break;
    await writePayload(payload);
  }
};
