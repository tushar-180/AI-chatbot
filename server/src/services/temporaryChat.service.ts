import { BASE_SYSTEM_PROMPT } from "../constants/prompt.constants";
import { getLimitedMessages } from "../utils/chatHistory";
import { userService } from "./user.service";
import { memoryService } from "./memory.service";
import { webSearchService, type WebGroundingContext } from "../modules/web-search";
import { ChatMessage, StreamPayload } from "../types/chat.types";
import { aiService } from "./ai.service";
import { chatStreamRegistry } from "./chatStreamRegistry.service";
import { processAttachedFile } from "../modules/file-rag/fileHandler";
import { retrieveFileContext } from "../modules/file-rag/fileRetrieval";
import { mcpClientService } from "./mcpClient.service";
import "multer"; // ensures Express.Multer.File namespace is available

const getEnabledMcpTools = async (userId: string, hasFiles: boolean = true) => {
  const user = await userService.getUserByClerkId(userId);
  const disabledMcpServers = (user?.get("disabledMcpServers") || []) as string[];
  const allTools = await mcpClientService.getActiveTools();

  return allTools.filter((tool) => {
    if (disabledMcpServers.includes(tool._serverName)) return false;

    if (!hasFiles) {
      const toolName = tool.name.toLowerCase();
      const serverName = (tool._serverName || "").toLowerCase();
      if (
        toolName.includes("excel") || serverName.includes("excel") ||
        toolName.includes("csv") || serverName.includes("csv") ||
        toolName.includes("pdf") || serverName.includes("pdf") ||
        toolName.includes("file") || serverName.includes("file") ||
        toolName.includes("document") || serverName.includes("document")
      ) {
        return false;
      }
    }
    return true;
  });
};

const finalizeGroundedResponse = (
  response: string,
  webGrounding: WebGroundingContext | null,
) => {
  if (!webGrounding?.citationsMarkdown) {
    return { content: response, appendedCitations: "" };
  }

  const alreadyHasSources = webGrounding.sources.some((source) =>
    response.includes(source.url),
  );

  if (alreadyHasSources || /(^|\n)Sources:\s*$/im.test(response)) {
    return { content: response, appendedCitations: "" };
  }

  const appendedCitations = webGrounding.citationsMarkdown;
  return {
    content: `${response.trimEnd()}${appendedCitations}`,
    appendedCitations,
  };
};

const buildTemporaryPromptMessages = async (
  userId: string,
  chatMessages: ChatMessage[],
  latestUserMessage?: string,
  webSearchEnabled = false,
  provider?: string,
) => {
  const promptMessages = getLimitedMessages(chatMessages);
  const systemMessages: ChatMessage[] = [
    {
      role: "system",
      content: BASE_SYSTEM_PROMPT,
      userId,
      status: "completed",
    },
  ];

  let fileContext: string | null = null;
  const userMessagesWithFiles = promptMessages
    .filter((m) => m.role === "user" && m.attachments?.some((a) => a.storagePath))
    .slice(-1);

  if (userMessagesWithFiles.length > 0) {
    const lastFileMsg = userMessagesWithFiles[0];
    const storagePath = lastFileMsg.attachments?.find((a) => a.storagePath)?.storagePath;
    if (storagePath) {
      const context = await retrieveFileContext(promptMessages, storagePath);
      if (context) {
        fileContext = context;
      }
    }
  }

  if (fileContext) {
    systemMessages.push({
      role: "system",
      content: `The user provided a file. Use its content to answer any questions. The file text:\n\n${fileContext}`,
      userId,
      status: "completed",
    });
  }

  let webGrounding: WebGroundingContext | null = null;
  const supportsImages = provider?.startsWith("gemini");
  if (webSearchEnabled && latestUserMessage) {
    const result = await webSearchService.buildGroundingContext(
      latestUserMessage,
      chatMessages,
      userId,
      supportsImages,
    );

    if (result && "rejected" in result) {
      console.warn(`[temporary chat] Web search rejected: ${result.reason} — ${result.message}`);
    } else {
      webGrounding = result;
    }
  }

  if (webGrounding) {
    systemMessages.push({
      role: "system",
      content: webGrounding.systemPrompt,
      userId,
      status: "completed",
    });
  }

  return {
    promptMessages: [...systemMessages, ...promptMessages],
    webGrounding,
  };
};

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
        sources: webGrounding.sources.map((s) => ({
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
      const tools = webSearchEnabled ? [] : await getEnabledMcpTools(String(userId), hasFiles);

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
      const detailedErrorMessage = `⚠️ **Failed to generate response.** The model \`${providerName}\` encountered an error or is temporarily unavailable. Please try again.`;
      chatStreamRegistry.fail(requestId, detailedErrorMessage);
      yield { error: detailedErrorMessage, status: "failed" };
    }
  }
};
