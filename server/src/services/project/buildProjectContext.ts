import { BASE_SYSTEM_PROMPT } from "../../constants/prompt.constants";
import { projectRepository } from "../../repositories/project.repository";
import { ChatMessage } from "../../types/chat.types";
import { getLimitedMessages } from "../../utils/chatHistory";
import { userService } from "../user/user.service";
import { memoryService } from "../memory/memory.service";
import {
  type WebGroundingContext,
  type SearchRejection,
  webSearchService,
} from "../../modules/web-search";
import { chatRepository } from "../../repositories/chat.repository";


export const buildProjectContext = async (
  userId: string,
  projectId: string,
  chatMessages: ChatMessage[],
  latestUserMessage?: string,
  webSearchEnabled = false,
  provider?: string,
  currentChatId?: string,
) => {
  const project = await projectRepository.findByIdAndUser(projectId, userId);
  if (!project) {
    throw new Error("Project not found");
  }

  // ── 1. Base system prompt ─────────────────────────────────────────────
  const systemMessages: ChatMessage[] = [
    {
      role: "system",
      content: BASE_SYSTEM_PROMPT,
      userId,
      status: "completed",
    },
  ];
  
  if (project.description && project.description.trim()) {
    systemMessages.push({
      role: "system",
      content: `[PROJECT DESCRIPTION]\nYou are working within a project. Here is its description:\n${project.description.trim()}`,
      userId,
      status: "completed",
    });
  }

  if (project.instructions && project.instructions.trim()) {
    systemMessages.push({
      role: "system",
      content: `[PROJECT INSTRUCTIONS]\nFollow these project-specific instructions:\n${project.instructions.trim()}`,
      userId,
      status: "completed",
    });
  }



  const personalizationContext =
    await userService.getPersonalizationContext(userId);
  if (personalizationContext) {
    systemMessages.push({
      role: "system",
      content: personalizationContext,
      userId,
      status: "completed",
    });
  }

  // ── 4. User-level memories (RAG-based, relevant to current message) ──
  const memoryContext = await memoryService.getMemoryContext(
    userId,
    latestUserMessage,
  );
  if (memoryContext) {
    systemMessages.push({
      role: "system",
      content: memoryContext,
      userId,
      status: "completed",
    });
  }

  // ── 5. Cross-chat project memory ──────────────────────────────────────
  // Resolve the current chatId: prefer the explicit argument, then fall back
  // to scanning the first message document for a chatId field (Mongoose docs).
  const resolvedChatId =
    currentChatId ||
    (chatMessages[0] as any)?.chatId?.toString?.() ||
    "";

  if (resolvedChatId) {
    try {
      const siblingChats = await chatRepository.findRecentMessagesByProjectId(
        projectId,
        resolvedChatId,
        6,  // last 6 messages per sibling chat
        5,  // up to 5 most-recently-updated sibling chats
      );

      if (siblingChats.length > 0) {
        const lines: string[] = [
          "[PROJECT SHARED MEMORY]",
          "The following are recent conversations from other chats in this same project.",
          "Use this context to maintain continuity, avoid repeating work, and stay aware of prior decisions.",
          "",
        ];

        for (const { chatTitle, messages } of siblingChats) {
          lines.push(`--- Chat: "${chatTitle}" ---`);
          for (const msg of messages) {
            const prefix = msg.role === "user" ? "User" : "Assistant";
            lines.push(`${prefix}: ${msg.content}`);
          }
          lines.push("");
        }

        systemMessages.push({
          role: "system",
          content: lines.join("\n"),
          userId,
          status: "completed",
        });
      }
    } catch (err) {
      // Non-fatal: if cross-chat memory fails, proceed without it
      console.error("[project-chat] Failed to load cross-chat memory:", err);
    }
  }

  // ── 6. Web search grounding (if enabled) ──────────────────────────────
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
      console.warn(
        `[project-chat] Web search rejected: ${result.reason} — ${result.message}`,
      );
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

  // ── 7. Chat history (conversation messages only, no project metadata)
  const rawPromptMessages = getLimitedMessages(chatMessages);
  const promptMessages = rawPromptMessages.map((m) => {
    const raw = typeof (m as any).toObject === "function" ? (m as any).toObject() : { ...m };
    
    // Maintain selection explanation if present
    if (raw.role === "user" && raw.metadata?.selection) {
      const selection = raw.metadata.selection;
      const userRequest = raw.content?.trim() || "Explain this.";
      raw.content = `User selected text from a previous assistant message.

Selected text:
"${selection.selectedText}"

Original message:
"${selection.originalSourceMessage}"

User request:
${userRequest}`;
    }
    
    return { ...raw };
  });

  return {
    promptMessages: [...systemMessages, ...promptMessages],
    webGrounding,
  };
};
