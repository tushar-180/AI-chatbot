import { BASE_SYSTEM_PROMPT } from "../constants/prompt.constants";
import { projectRepository } from "../repositories/project.repository";
import { ChatMessage } from "../types/chat.types";
import { getLimitedMessages } from "../utils/chatHistory";
import { userService } from "./user.service";
import { memoryService } from "./memory.service";
import {
  type WebGroundingContext,
  type SearchRejection,
  webSearchService,
} from "../modules/web-search";


export const buildProjectContext = async (
  userId: string,
  projectId: string,
  chatMessages: ChatMessage[],
  latestUserMessage?: string,
  webSearchEnabled = false,
  provider?: string,
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

  if (project.memory && project.memory.trim()) {
    systemMessages.push({
      role: "system",
      content: `[PROJECT MEMORY]\nHere are persistent facts and notes for this project:\n${project.memory.trim()}`,
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

  // ── 5. Web search grounding (if enabled) ──────────────────────────────
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

  // ── 6. Chat history (conversation messages only, no project metadata)
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
