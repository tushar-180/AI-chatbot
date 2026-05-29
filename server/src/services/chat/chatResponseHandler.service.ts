import { aiService } from "../ai/ai.service";
import { chatRepository } from "../../repositories/chat.repository";
import { chatStreamRegistry } from "../streams/streamRegistry.service";
import { getEnabledMcpTools } from "../mcp/mcpToolFilter.service";
import { userService } from "../user/user.service";
import { memoryService } from "../memory/memory.service";
import { buildPromptMessages } from "./promptBuilder.service";
import { resolveActiveBranch } from "../../utils/branchUtils";
import type { RawMessage } from "../../types/branch.types";
import { buildGroundingMetadata, finalizeGroundedResponse } from "../../utils/webGrounding";
import { serializePromptMessages, calculateUsage } from "../../utils/tokenCounter";
import { logTokenUsage } from "../../utils/tokenCounter";
import { ChatMessage, StreamPayload } from "../../types/chat.types";
import type { TokenUsage } from "../../types/token.types";

const resolveAssistantTokens = (
  usage: TokenUsage | undefined,
  promptText: string,
  completionText: string,
  promptAttachmentCount = 0,
) => usage ?? calculateUsage(promptText, completionText, promptAttachmentCount);

const getChatId = (chat: { _id: unknown }) => String(chat._id);

export async function* streamAssistantResponse(
  chat: any,
  requestId: string,
  provider?: string,
  includeChatId = false,
  existingAssistantMessageId?: string,
  webSearchOverride?: boolean,
  branchMeta?: {
    parentId?: string;
    retryOf?: string;
    editedFrom?: string;
    branchId?: string;
    version?: number;
  },
): AsyncGenerator<StreamPayload> {
  await aiService.validateModelAccess(provider);
  const aiProvider = aiService.getProvider(provider);
  const providerName = aiProvider.getProviderName();
  const chatId = getChatId(chat);

  const activeMessages = resolveActiveBranch(chat.messages as RawMessage[]) as any[] as ChatMessage[];

  const messagesForPrompt = existingAssistantMessageId
    ? activeMessages.filter(
      (m) => String(m.id || m._id || m.requestId) !== String(existingAssistantMessageId),
    )
    : activeMessages;

  const lastUserMessage = messagesForPrompt
    .filter((m) => m.role === "user")
    .pop();

  const isWebSearchEnabled = webSearchOverride !== undefined 
    ? webSearchOverride 
    : Boolean(lastUserMessage?.metadata?.webSearchEnabled);

  const { promptMessages, webGrounding } = await buildPromptMessages(
    String(chat.userId),
    messagesForPrompt,
    lastUserMessage?.content,
    isWebSearchEnabled,
    provider,
    chat.projectId ? String(chat.projectId) : undefined,
    chatId,
  );

  let assistantMessageDoc;
  if (existingAssistantMessageId) {
    assistantMessageDoc = await chatRepository.updateMessage(
      existingAssistantMessageId,
      {
        content: "",
        status: "streaming",
        requestId,
        model: providerName,
        metadata: buildGroundingMetadata(webGrounding),
      },
    );
  } else {
    assistantMessageDoc = await chatRepository.saveMessage(chatId, {
      role: "assistant",
      userId: chat.userId,
      content: "",
      model: providerName,
      requestId,
      status: "streaming",
      metadata: buildGroundingMetadata(webGrounding),
      parentId: branchMeta?.parentId || (lastUserMessage ? String(lastUserMessage._id || lastUserMessage.id) : undefined),
      ...(branchMeta ? {
        retryOf: branchMeta.retryOf,
        editedFrom: branchMeta.editedFrom,
        branchId: branchMeta.branchId,
        version: branchMeta.version ?? 1,
        isActive: true,
      } : {}),
    } as any);
  }

  const messageId = (assistantMessageDoc as any)._id?.toString() || "";
  const activeStream = chatStreamRegistry.create({
    requestId,
    chatId,
    messageId,
    model: providerName,
  });

  if (activeStream.status === "stopped") {
    await chatRepository.updateMessage(messageId, {
      status: "stopped",
    });
    yield (
      includeChatId
        ? {
          chatId,
          messageId,
          requestId,
          model: providerName,
          status: "stopped",
          done: true,
        }
        : { messageId, requestId, model: providerName, status: "stopped", done: true }
    ) as StreamPayload;
    return;
  }

  yield (
    includeChatId
      ? {
        chatId,
        messageId,
        requestId,
        model: providerName,
        status: "streaming",
      }
      : { messageId, requestId, model: providerName, status: "streaming" }
  ) as StreamPayload;

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
    const latestUserMsgText = promptMessages.filter(m => m.role === 'user').pop()?.content || "";
    const tools = isWebSearchEnabled 
      ? [] 
      : await getEnabledMcpTools(String(chat.userId), hasFiles, latestUserMsgText);
    const stream = await aiProvider.generateStreamResponse(
      promptMessages,
      activeStream.abortController.signal,
      tools,
    );
    const timeout = setTimeout(() => {
      if (!receivedFirstChunk) {
        console.error(`AI generation timed out for requestId: ${requestId}`);
        firstTokenTimedOut = true;
        activeStream.abortController.abort();
      }
    }, 50000);

    try {
      for await (const chunk of stream) {
        if (activeStream.abortController.signal.aborted) {
          break;
        }

        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          firstTokenTimedOut = false;
          clearTimeout(timeout);
          chatRepository.update(chatId, { isSidebarVisible: true }).catch((err) => {
            console.error("Failed to make chat sidebar visible on first chunk:", err);
          });
        }

        fullResponse += chunk;
        chatStreamRegistry.updateResponse(requestId, fullResponse, chunk);
        yield { chunk, requestId, status: "streaming" };
      }
    } finally {
      clearTimeout(timeout);
    }

    chatStreamRegistry.updateUsage(requestId, await stream.usage);

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

    const finalStatus = activeStream.abortController.signal.aborted
      ? "stopped"
      : "completed";

    const promptText = serializePromptMessages(promptMessages);
    const promptAttachmentCount = promptMessages.reduce(
      (sum, m) => sum + (m.attachments?.length || 0),
      0,
    );
    const tokens = resolveAssistantTokens(
      activeStream.usage,
      promptText,
      fullResponse,
      promptAttachmentCount,
    );

    await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
      content: fullResponse,
      status: finalStatus,
      model: providerName,
      attachments: [],
      type: "text",
      metadata: buildGroundingMetadata(webGrounding),
      tokens,
    });
    
    const promptAttachments = promptMessages.flatMap(m => m.attachments || []).map(a => ({
      name: a.name || "file",
      mimeType: a.mimeType || "unknown"
    }));

    const userForLog = await userService.getUserByClerkId(String(chat.userId));
    const usernameLog = userForLog?.get("firstName") || userForLog?.get("email")?.split("@")[0] || String(chat.userId);

    logTokenUsage({
      model: providerName,
      usage: tokens,
      context: "privateChat",
      username: usernameLog,
      chatTitle: chat.title,
      messageId: (assistantMessageDoc as any)._id?.toString(),
      hasWebSearch: webGrounding ? !("rejected" in webGrounding) : false,
      mcpToolsProvided: tools ? tools.length : 0,
      attachments: promptAttachments,
    });

    if (activeStream.abortController.signal.aborted) {
      yield { done: true, chatId, requestId, status: "stopped" };
      return;
    }

    chatStreamRegistry.complete(requestId);
    yield { done: true, chatId, requestId, status: "completed" };

    const lastUserMessageDoc = (chat.messages as ChatMessage[])
      .filter((m) => m.role === "user")
      .pop();
    if (lastUserMessageDoc) {
      memoryService
        .extractMemoriesFromMessage(chat.userId, lastUserMessageDoc.content)
        .catch((err) => {
          console.error("Background memory extraction failed:", err);
        });
    }
  } catch (aiError) {
    const isTimeout =
      (aiError instanceof Error && aiError.message.includes("timed out")) ||
      firstTokenTimedOut;
    const errorMessage = isTimeout
      ? "AI generation timed out."
      : "An unexpected error occurred during generation.";

    if (activeStream.abortController.signal.aborted && !isTimeout) {
      const promptText = serializePromptMessages(promptMessages);
      const promptAttachmentCount = promptMessages.reduce(
        (sum, m) => sum + (m.attachments?.length || 0),
        0,
      );
      const tokens = resolveAssistantTokens(
        activeStream.usage,
        promptText,
        activeStream.fullResponse,
        promptAttachmentCount,
      );
      await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
        content: activeStream.fullResponse,
        status: "stopped",
        tokens,
      });
      yield { done: true, chatId, requestId, status: "stopped" };
      return;
    }

    console.error("AI Error in chat stream:", aiError);
    const promptText = serializePromptMessages(promptMessages);
    const promptAttachmentCount = promptMessages.reduce(
      (sum, m) => sum + (m.attachments?.length || 0),
      0,
    );
    const tokens = resolveAssistantTokens(
      activeStream.usage,
      promptText,
      "",
      promptAttachmentCount,
    );
    const detailedErrorMessage = `**Failed to generate response.** The model \`${providerName}\` encountered an error or is temporarily unavailable. Please try again.`;
    await chatRepository.updateMessage((assistantMessageDoc as any)._id, {
      content: detailedErrorMessage,
      status: "failed",
      tokens,
    });

    chatStreamRegistry.fail(requestId, detailedErrorMessage);
    yield { error: detailedErrorMessage, status: "failed" };
  }
}
