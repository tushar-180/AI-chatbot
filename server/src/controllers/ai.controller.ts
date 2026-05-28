import { Request, Response } from "express";
import { aiService } from "../services/ai.service";
import { TokenUsageRecord } from "../models/Chat.model";
import { setSseHeaders, splitAndWriteChunk, writeSse } from "../utils/sse";

export const getAvailableProviders = async (_req: Request, res: Response) => {
  try {
    const providers = await aiService.getAvailableProviders();
    return res.json({ providers });
  } catch (error) {
    console.error("Error fetching AI providers:", error);
    return res.status(500).json({ error: "Failed to fetch AI providers" });
  }
};

export const streamCompare = async (req: Request, res: Response) => {
  try {
    const { prompt, provider, attachments, sessionId } = req.body;
    const userId = req.clerkId;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required and must be a non-empty string" });
    }
    if (!provider || typeof provider !== "string") {
      return res.status(400).json({ error: "Provider is required and must be a string" });
    }
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();

    // SSE Setup — no Chat or Message documents are created for compare mode
    setSseHeaders(res);

    const abortController = new AbortController();
    let clientDisconnected = false;

    req.on("close", () => {
      clientDisconnected = true;
      abortController.abort();
    });

    // Build prompt messages (with optional image attachments)
    const promptMessages = [
      { role: "user" as const, content: prompt, attachments: attachments || [] },
    ];

    const stream = await aiProvider.generateStreamResponse(
      promptMessages,
      abortController.signal
    );

    // Send initial meta chunk — sessionId ties this stream to the client-side arena slot
    writeSse(res, {
      sessionId: sessionId || null,
      model: providerName,
      status: "streaming",
    });

    let fullResponse = "";

    try {
      for await (const chunk of stream) {
        if (clientDisconnected || abortController.signal.aborted) {
          break;
        }
        fullResponse += chunk;
        await splitAndWriteChunk(res, chunk, {
          sessionId: sessionId || null,
          status: "streaming",
        });
      }
    } catch (streamError: any) {
      console.error("Stream generation error:", streamError);
      if (!res.writableEnded) {
        writeSse(res, { error: streamError.message || "Failed to generate stream response" });
        res.end();
      }
      return;
    }

    const finalStatus = abortController.signal.aborted ? "stopped" : "completed";

    // Resolve REAL token usage from the provider API response
    const finalUsage = await stream.usage.catch(() => undefined);
    const promptTokens = finalUsage?.promptTokens ?? 0;
    const completionTokens = finalUsage?.completionTokens ?? 0;
    const totalTokens = finalUsage?.totalTokens ?? (promptTokens + completionTokens);

    const tokens = { promptTokens, completionTokens, totalTokens };

    // Persist only the token usage — no Chat, no Message documents needed
    await TokenUsageRecord.create({
      userId,
      role: "assistant",
      model: providerName,
      source: "compare",
      tokens,
    });

    // Close SSE with final usage metrics
    if (!clientDisconnected && !res.writableEnded) {
      writeSse(res, {
        done: true,
        sessionId: sessionId || null,
        status: finalStatus,
        usage: tokens,
      });
      res.end();
    }

  } catch (error: any) {
    console.error("Error in streamCompare:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to initiate comparison stream" });
    } else {
      if (!res.writableEnded) {
        writeSse(res, { error: error.message || "Unexpected comparison stream error" });
        res.end();
      }
    }
  }
};
