import { BASE_SYSTEM_PROMPT } from "../../constants/prompt.constants";
import { getLimitedMessages } from "../../utils/chatHistory";
import { userService } from "../user/user.service";
import { memoryService } from "../memory/memory.service";
import { buildTemporaryPromptMessages } from "./promptBuilder.service";
import { webSearchService, type WebGroundingContext } from "../../modules/web-search";
import { ChatMessage, StreamPayload } from "../../types/chat.types";
import { aiService } from "../ai/ai.service";
import { chatStreamRegistry } from "../streams/streamRegistry.service";
import { processAttachedFile } from "../../modules/file-rag/fileHandler";
import { retrieveFileContext } from "../../modules/file-rag/fileRetrieval";
import { mcpClientService } from "../mcp/mcpClient.service";
import { getEnabledMcpTools } from "../mcp/mcpToolFilter.service";
import { finalizeGroundedResponse } from "../../utils/webGrounding";
import "multer"; // ensures Express.Multer.File namespace is available






export const temporaryChatService = {
  async *streamTemporaryChat({
    userId,
    messages,
    provider,
    requestId,
    webSearchEnabled,
    attachedFile,
  }: {
    userId: string;
    messages: ChatMessage[];
    provider?: string;
    requestId: string;
    webSearchEnabled?: boolean;
    attachedFile?: Express.Multer.File | null;
  }): AsyncGenerator<StreamPayload> {
    await aiService.validateModelAccess(provider);
    const aiProvider = aiService.getProvider(provider);
    const providerName = aiProvider.getProviderName();

    const lastUserMessage = messages
      .filter((m) => m.role === "user")
      .pop();

    if (attachedFile && lastUserMessage) {
      const result = await processAttachedFile(attachedFile, userId, lastUserMessage.attachments || []);
      lastUserMessage.attachments = result.attachments;
    }

    const { promptMessages, webGrounding } = await buildTemporaryPromptMessages(
      userId,
      messages,
      lastUserMessage?.content,
      Boolean(webSearchEnabled),
      provider,
    );

    const chatId = `temp_chat_${requestId}`;
    const messageId = `temp_msg_${requestId}`;

    const activeStream = chatStreamRegistry.create({
      requestId,
      chatId,
      messageId,
      model: providerName,
    });

    yield {
      messageId,
      requestId,
      model: providerName,
      status: "streaming",
    } as StreamPayload;

    if (
      webGrounding &&
      !("rejected" in webGrounding) &&
      webGrounding.sources.length > 0
    ) {
      yield {
        type: "sources",
        sources: webGrounding.sources.map((s: any) => ({
          id: s.id,
          url: s.url,
          title: s.title,
          hostname: s.hostname,
          snippet: s.snippet,
        })),
        requestId,
      } as StreamPayload;
    }

    let fullResponse = "";
    let receivedFirstChunk = false;
    let firstTokenTimedOut = false;

    try {
      const hasFiles = promptMessages.some((m) =>
        m.attachments?.some((a: any) => a.mimeType && !a.mimeType.startsWith("image/"))
      );
      const tools = webSearchEnabled ? [] : await getEnabledMcpTools(String(userId), hasFiles, lastUserMessage?.content || "");

      const stream = await aiProvider.generateStreamResponse(
        promptMessages,
        activeStream.abortController.signal,
        tools,
      );

      const timeout = setTimeout(() => {
        if (!receivedFirstChunk) {
          console.error(`AI generation timed out for temporary requestId: ${requestId}`);
          firstTokenTimedOut = true;
          activeStream.abortController.abort();
        }
      }, 30000);

      try {
        for await (const chunk of stream) {
          if (activeStream.abortController.signal.aborted) {
            break;
          }

          if (!receivedFirstChunk) {
            receivedFirstChunk = true;
            firstTokenTimedOut = false;
            clearTimeout(timeout);
          }

          fullResponse += chunk;
          chatStreamRegistry.updateResponse(requestId, fullResponse, chunk);
          yield { chunk, requestId, status: "streaming" };
        }
      } finally {
        clearTimeout(timeout);
      }

      if (!fullResponse.trim() && !activeStream.abortController.signal.aborted) {
        fullResponse = "The AI was unable to generate a response. Please try rephrasing your request or check if it was blocked by safety filters.";
        chatStreamRegistry.updateResponse(requestId, fullResponse, fullResponse);
        yield { chunk: fullResponse, requestId, status: "streaming" };
      }

      const groundedResponse = finalizeGroundedResponse(
        fullResponse,
        webGrounding,
      );
      if (
        groundedResponse.appendedCitations &&
        !activeStream.abortController.signal.aborted
      ) {
        fullResponse = groundedResponse.content;
        chatStreamRegistry.updateResponse(
          requestId,
          fullResponse,
          groundedResponse.appendedCitations,
        );
        yield {
          chunk: groundedResponse.appendedCitations,
          requestId,
          status: "streaming",
        };
      }

      if (activeStream.abortController.signal.aborted) {
        yield { done: true, chatId, requestId, status: "stopped" };
        return;
      }

      chatStreamRegistry.complete(requestId);
      yield { done: true, chatId, requestId, status: "completed" };

    } catch (aiError) {
      const isTimeout =
        (aiError instanceof Error && aiError.message.includes("timed out")) ||
        firstTokenTimedOut;
      const errorMessage = isTimeout
        ? "AI generation timed out."
        : "An unexpected error occurred during generation.";

      if (activeStream.abortController.signal.aborted && !isTimeout) {
        yield { done: true, chatId, requestId, status: "stopped" };
        return;
      }

      console.error("AI Error in temporary chat stream:", aiError);
      const detailedErrorMessage = `**Failed to generate response.** The model \`${providerName}\` encountered an error or is temporarily unavailable. Please try again.`;
      chatStreamRegistry.fail(requestId, detailedErrorMessage);
      yield { error: detailedErrorMessage, status: "failed" };
    }
  }
};
