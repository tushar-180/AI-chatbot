import { GroupChat, GroupMessage } from "../models/GroupChat.model";
import { Message, Chat, TokenUsageRecord } from "../models/Chat.model";
import { User } from "../models/User.model";
import { groupSocketManager } from "../utils/groupSocket";
import { aiService } from "./ai.service";
import { userService } from "./user.service";
import { mcpClientService } from "./mcpClient.service";
import { BASE_SYSTEM_PROMPT, GROUP_CHAT_SYSTEM_PROMPT } from "../constants/prompt.constants";
import {
  webSearchService,
  type WebGroundingContext,
} from "../modules/web-search";
import { groupStreamRegistry } from "./groupStreamRegistry.service";
import type { ChatMessage } from "../types/chat.types";
import type { AIMessage, AIRole } from "./ai/types";
import { parseMultimedia } from "../utils/chatHistory";
import crypto from "crypto";
import { processAttachedFile } from "../modules/file-rag/fileHandler";
import { retrieveFileContext } from "../modules/file-rag/fileRetrieval";
import mongoose from "mongoose";
import { calculateUsage, estimateTokenCount, serializePromptMessages } from "../utils/tokenCounter";

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

export class GroupChatService {
  private static sanitizeAssistantResponse(content: string) {
    return content
      .replace(/^(?:\s*\[?(?:velora(?:\s*\([^\]]+\))?)\]?:\s*)+/i, "")
      .trim();
  }

  private static serializeGroupMessage(message: any) {
    return {
      _id: message._id.toString(),
      groupId: message.groupId.toString(),
      userId: message.userId,
      username: message.username,
      userImage: message.userImage || undefined,
      role: message.role,
      content: message.content,
      status: message.status,
      type: message.type,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt ? message.updatedAt.toISOString() : message.createdAt.toISOString(),
      model: message.model,
      metadata: message.metadata,
      sources: message.metadata?.sources || undefined,
      attachments: message.attachments || [],
      reactions: (message.reactions || []).map((r: any) => ({
        userId: r.userId,
        username: r.username,
        type: r.type,
      })),
    };
  }

  private static async findAssistantMessageForRetry(
    groupId: string,
    messageId: string,
  ) {
    const isValidObjectId = mongoose.Types.ObjectId.isValid(messageId);

    let assistantMessage = isValidObjectId
      ? await GroupMessage.findOne({
        _id: messageId,
        groupId,
        role: "assistant",
      })
      : null;

    // Streaming assistant placeholders use temporary UUIDs on the client.
    // If one of those reaches the server, fall back to the latest persisted
    // assistant message so retry stays usable instead of failing hard.
    if (!assistantMessage && messageId.includes("-")) {
      assistantMessage = await GroupMessage.findOne({
        groupId,
        role: "assistant",
      }).sort({ createdAt: -1 });
    }

    return assistantMessage;
  }

  static async createGroup(chatId: string, clerkId: string) {
    console.log(`Creating group for chat ${chatId} by user ${clerkId}`);
    const originalChat = await Chat.findById(chatId);
    if (!originalChat) {
      console.error("Original chat not found:", chatId);
      throw new Error("Original chat not found");
    }

    const user = await User.findOne({ clerkId });
    if (!user) {
      console.error("User not found for clerkId:", clerkId);
      throw new Error("User not found");
    }

    const username = user.firstName || user.email.split("@")[0];
    const userImage = user.imageUrl;

    const inviteCode = crypto.randomUUID().substring(0, 8);

    const groupChat = await GroupChat.create({
      title: `${originalChat.title} (Group)`,
      creatorId: clerkId,
      members: [{ userId: clerkId, username, userImage, joinedAt: new Date() }],
      originalChatId: chatId,
      inviteCode,
    });

    // Copy messages
    const messages = await Message.find({ chatId }).sort({ createdAt: 1 });
    const groupMessages = messages.map((msg) => ({
      groupId: groupChat._id,
      userId: msg.userId,
      username: msg.role === "assistant" ? "Velora" : username,
      userImage: msg.role === "assistant" ? null : userImage,
      role: msg.role,
      content: msg.content,
      type: msg.type,
      metadata: msg.metadata,
      attachments: msg.attachments || [],
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt || msg.createdAt,
    }));

    if (groupMessages.length > 0) {
      await GroupMessage.insertMany(groupMessages, { timestamps: false });
    }

    return await this.populateGroupMembers(groupChat);
  }

  static async getGroupByInviteCode(inviteCode: string) {
    const group = await GroupChat.findOne({ inviteCode });
    return await this.populateGroupMembers(group);
  }

  static async joinGroup(inviteCode: string, clerkId: string) {
    const group = await GroupChat.findOne({ inviteCode });
    if (!group) throw new Error("Group not found");

    const user = await User.findOne({ clerkId });
    if (!user) throw new Error("User not found");

    const username = user.firstName || user.email.split("@")[0];
    const userImage = user.imageUrl;

    const isMember = group.members.some((m) => m.userId === clerkId);
    if (!isMember) {
      group.members.push({
        userId: clerkId,
        username,
        userImage,
        joinedAt: new Date(),
      });
      await group.save();

      // Create join message
      const joinMsg = await GroupMessage.create({
        groupId: group._id,
        userId: "system",
        username: "System",
        role: "system",
        content: `${username} joined the group`,
        type: "event",
      });

      groupSocketManager.broadcast(group._id.toString(), {
        type: "message",
        message: joinMsg,
      });

      groupSocketManager.broadcast(group._id.toString(), {
        type: "member_joined",
        member: { userId: clerkId, username, userImage, joinedAt: new Date() },
      });
    }

    return await this.populateGroupMembers(group);
  }

  static async leaveGroup(groupId: string, clerkId: string) {
    const group = await GroupChat.findById(groupId);
    if (!group) throw new Error("Group not found");

    const memberIndex = group.members.findIndex((m) => m.userId === clerkId);
    if (memberIndex === -1) throw new Error("Not a member");

    const username = group.members[memberIndex].username;
    const isCreatorLeaving = clerkId === group.creatorId;

    group.members.splice(memberIndex, 1);

    let newAdmin: any = null;
    if (isCreatorLeaving && group.members.length > 0) {
      const sortedRemaining = [...group.members].sort(
        (a, b) =>
          new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      );
      newAdmin = sortedRemaining[0];
      group.creatorId = newAdmin.userId;
    }

    await group.save();

    // Create leave message
    const leaveMsg = await GroupMessage.create({
      groupId: group._id,
      userId: "system",
      username: "System",
      role: "system",
      content: `${username} left the group`,
      type: "event",
    });

    groupSocketManager.broadcast(groupId, {
      type: "message",
      message: leaveMsg,
    });

    groupSocketManager.broadcast(groupId, {
      type: "member_left",
      userId: clerkId,
    });

    if (newAdmin) {
      const adminChangeMsg = await GroupMessage.create({
        groupId: group._id,
        userId: "system",
        username: "System",
        role: "system",
        content: `Admin status transferred to ${newAdmin.username}`,
        type: "event",
      });

      groupSocketManager.broadcast(groupId, {
        type: "message",
        message: adminChangeMsg,
      });

      groupSocketManager.broadcast(groupId, {
        type: "admin_changed",
        creatorId: newAdmin.userId,
      });
    }

    return { success: true };
  }

  static async removeMember(
    groupId: string,
    adminClerkId: string,
    memberClerkId: string,
  ) {
    const group = await GroupChat.findById(groupId);
    if (!group) throw new Error("Group not found");

    if (group.creatorId !== adminClerkId) {
      throw new Error("Unauthorized: Only the group admin can remove members");
    }

    const memberIndex = group.members.findIndex(
      (m) => m.userId === memberClerkId,
    );
    if (memberIndex === -1)
      throw new Error("User is not a member of this group");

    const username = group.members[memberIndex].username;
    group.members.splice(memberIndex, 1);
    await group.save();

    // Create system removal event message
    const removeMsg = await GroupMessage.create({
      groupId: group._id,
      userId: "system",
      username: "System",
      role: "system",
      content: `Admin removed ${username} from the group`,
      type: "event",
    });

    groupSocketManager.broadcast(groupId, {
      type: "message",
      message: removeMsg,
    });

    groupSocketManager.broadcast(groupId, {
      type: "member_left",
      userId: memberClerkId,
      reason: "removed",
    });

    return { success: true };
  }

  static async getGroupMessages(groupId: string) {
    const messages = await GroupMessage.find({ groupId }).sort({ createdAt: 1 });

    const userIds = Array.from(new Set(messages.filter(m => m.role === "user").map(m => m.userId)));
    if (userIds.length === 0) return messages;

    const users = await User.find({ clerkId: { $in: userIds } });
    const userMap = new Map(users.map((u: any) => [u.clerkId, u]));

    return messages.map((message: any) => {
      const msgObj = message.toObject ? message.toObject() : message;
      if (msgObj.role === "user") {
        const user = userMap.get(msgObj.userId);
        if (user) {
          msgObj.username = user.firstName || user.email?.split("@")[0] || msgObj.username;
          msgObj.userImage = user.imageUrl || msgObj.userImage;
        }
      }
      return msgObj;
    });
  }

  static async addMessage(
    groupId: string,
    clerkId: string,
    content: string,
    role: "user" | "assistant" = "user",
    webSearchEnabled = false,
    attachments: any[] = [],
    attachedFile: Express.Multer.File | null = null,
  ) {
    const group = await GroupChat.findById(groupId);
    if (!group) throw new Error("Group not found");

    let username = "Velora";
    let userImage = null;

    if (role === "user") {
      const userRecord = await User.findOne({ clerkId });
      if (userRecord) {
        username = userRecord.firstName || userRecord.email?.split("@")[0] || username;
        userImage = userRecord.imageUrl || userImage;
      } else {
        const member = group.members.find((m) => m.userId === clerkId);
        if (!member) throw new Error("Not a member of this group");
        username = member.username;
        userImage = member.userImage;
      }
    }

    let messageAttachments = [...attachments];

    if (attachedFile) {
      try {
        const result = await processAttachedFile(attachedFile, clerkId, messageAttachments);
        messageAttachments = result.attachments;
      } catch (err: any) {
        console.error("Failed to process attached file for group:", err);
      }
    }

    const message = await GroupMessage.create({
      groupId,
      userId: clerkId,
      username,
      userImage,
      role,
      content,
      status: "completed",
      metadata: webSearchEnabled ? { webSearchEnabled: true } : {},
      attachments: messageAttachments,
    });

    if (role === "user") {
      try {
        let targetProvider = process.env.AI_PROVIDER || "gemini:gemini-3.1-flash-lite-preview";
        const mentionMatch = content.match(/@([a-zA-Z0-9-:_/.]+)/);
        if (mentionMatch) {
          const mention = mentionMatch[1].toLowerCase();
          if (mention !== "velora" && mention !== "system") {
            const allProviders = await aiService.getAvailableProviders();
            const matchedProv = allProviders.find((p) => {
              const cleanName = p.id
                .split(":")
                .pop()
                ?.split("/")
                .pop()
                ?.toLowerCase();
              return cleanName === mention || p.id.toLowerCase() === mention;
            });
            if (matchedProv) {
              targetProvider = matchedProv.id;
            } else {
              targetProvider = mention;
            }
          }
        }

        const promptText = content || "";
        const attachmentCount = messageAttachments.length;
        const promptTokens = estimateTokenCount(promptText, attachmentCount);
        const tokens = {
          promptTokens,
          completionTokens: 0,
          totalTokens: promptTokens,
        };

        await TokenUsageRecord.findOneAndUpdate(
          { messageId: message._id },
          {
            userId: clerkId,
            chatId: groupId,
            role: "user",
            model: targetProvider,
            tokens,
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error("Failed to save user token usage in group:", err);
      }
    }

    groupSocketManager.broadcast(groupId, {
      type: "message",
      message: this.serializeGroupMessage(message),
    });

    // Handle Agent Mention
    const mentions = [...content.matchAll(/@([a-zA-Z0-9-:_/.]+)/g)].map(m => m[1].toLowerCase());
    if (mentions.length > 0) {
      const allProviders = await aiService.getAvailableProviders();
      const isAiMention = mentions.some((mention) => 
        mention === "velora" ||
        allProviders.some((p) => {
          const cleanName = p.id
            .split(":")
            .pop()
            ?.split("/")
            .pop()
            ?.toLowerCase();
          return cleanName === mention || p.id.toLowerCase() === mention;
        })
      );
      if (isAiMention) {
        groupSocketManager.broadcast(groupId, {
          type: "ai_thinking",
          isThinking: true,
          webSearchEnabled,
          requesterId: clerkId,
        });
        this.handleAiResponse(groupId, content, webSearchEnabled, clerkId).catch(
          console.error,
        );
      }
    }

    return message;
  }

  static async handleAiResponse(
    groupId: string,
    userContent: string,
    webSearchEnabled = false,
    clerkId?: string,
    overrideProvider?: string,
  ) {
    const group = await GroupChat.findById(groupId);
    if (!group) return;

    const messages = await GroupMessage.find({
      groupId,
      role: { $in: ["user", "assistant"] },
      type: { $ne: "event" },
    })
      .sort({ createdAt: -1 })
      .limit(50);
    const orderedMessages = messages.reverse();

    // Build prompt
    const promptMessages: AIMessage[] = orderedMessages.map((msg) => {
      const attachments = (msg.attachments || []).map((att: any) => {
        const rawAtt = att.toObject ? att.toObject() : att;
        return {
          ...rawAtt,
          url: rawAtt.url,
          name: rawAtt.name,
          mimeType: rawAtt.mimeType,
          size: rawAtt.size,
          localPath: rawAtt.localPath,
          storagePath: rawAtt.storagePath,
        };
      });
      return {
        role: msg.role as AIRole,
        content: msg.content,
        username: msg.username,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    });

    // --- File context injection ---
    let fileContext: string | null = null;
    const userMessagesWithFiles = orderedMessages
      .filter((m) => m.role === "user" && m.attachments?.some((a: any) => a.storagePath || (a.get && a.get('storagePath'))))
      .slice(-1); // take the most recent one

    if (userMessagesWithFiles.length > 0) {
      const lastFileMsg = userMessagesWithFiles[0];
      const attachmentWithFile = lastFileMsg.attachments?.find((a: any) => a.storagePath || (a.get && a.get('storagePath')));
      const storagePath = (attachmentWithFile as any)?.storagePath || (attachmentWithFile?.get && attachmentWithFile.get('storagePath'));
      if (storagePath) {
        // Retrieve file context using the recent messages
        const context = await retrieveFileContext(promptMessages as any, storagePath);
        if (context) {
          fileContext = context;
        }
      }
    }

    let webGrounding: WebGroundingContext | null = null;
    if (webSearchEnabled) {
      const maybeGrounding = await webSearchService.buildGroundingContext(
        userContent,
        promptMessages as any as ChatMessage[],
      );
      if (maybeGrounding && "systemPrompt" in maybeGrounding) {
        webGrounding = maybeGrounding as WebGroundingContext;
      }
    }

    // Add system prompt
    let finalSystemPrompt = BASE_SYSTEM_PROMPT + GROUP_CHAT_SYSTEM_PROMPT;

    if (fileContext) {
      finalSystemPrompt += `\n\n--- Document Context ---\n${fileContext}\n----------------------\n`;
    }

    promptMessages.unshift({
      role: "system",
      content: finalSystemPrompt
    });

    if (webGrounding) {
      promptMessages.unshift({
        role: "system",
        content: webGrounding.systemPrompt,
      });
    }

    let targetProvider: string | undefined = overrideProvider;
    if (!targetProvider) {
      const mentions = [...userContent.matchAll(/@([a-zA-Z0-9-:_/.]+)/g)].map(m => m[1].toLowerCase());
      const allProviders = await aiService.getAvailableProviders();
      
      for (const mention of mentions) {
        if (mention === "velora" || mention === "system") continue;
        const matchedProv = allProviders.find((p) => {
          const cleanName = p.id
            .split(":")
            .pop()
            ?.split("/")
            .pop()
            ?.toLowerCase();
          return cleanName === mention || p.id.toLowerCase() === mention;
        });
        if (matchedProv) {
          targetProvider = matchedProv.id;
          break;
        }
      }
    }

    if (!targetProvider) {
      targetProvider = process.env.AI_PROVIDER || "gemini:gemini-3.1-flash-lite-preview";
    }

    const cleanModelName = targetProvider.includes(":")
      ? targetProvider.split(":")[1]
      : targetProvider;
    const displayName = cleanModelName.includes("/")
      ? cleanModelName.split("/").pop() || cleanModelName
      : cleanModelName;
    const assistantUsername = `Velora (${displayName})`;

    let fullResponse = "";
    const tempId = crypto.randomUUID();

    // Register active stream
    const activeStream = groupStreamRegistry.create({
      groupId,
      tempId,
      assistantUsername,
      webSearchEnabled,
      promptMessages,
      targetProvider,
      clerkId,
    });

    try {
      const activeUserId = clerkId || group.creatorId;
      const hasFiles = promptMessages.some((m) =>
        m.attachments?.some((a: any) => a.mimeType && !a.mimeType.startsWith("image/"))
      );
      const tools = await getEnabledMcpTools(activeUserId, hasFiles);
      await aiService.validateModelAccess(targetProvider);
      const aiProvider = aiService.getProvider(targetProvider);
      const stream = await aiProvider.generateStreamResponse(
        promptMessages,
        activeStream.abortController.signal,
        tools,
      );

      for await (const chunk of stream) {
        if (activeStream.abortController.signal.aborted) {
          return;
        }
        fullResponse += chunk;
        groupStreamRegistry.updateResponse(groupId, fullResponse);
        groupSocketManager.broadcast(groupId, {
          type: "ai_stream",
          chunk,
          tempId,
          done: false,
          username: assistantUsername,
          webSearchEnabled,
        });
      }

      if (activeStream.abortController.signal.aborted) {
        return;
      }

      if (!fullResponse.trim()) {
        fullResponse = "The AI was unable to generate a response. Please try rephrasing your request or check if it was blocked by safety filters.";
        groupStreamRegistry.updateResponse(groupId, fullResponse);
        groupSocketManager.broadcast(groupId, {
          type: "ai_stream",
          chunk: fullResponse,
          tempId,
          done: false,
          username: assistantUsername,
          webSearchEnabled,
        });
      }

      fullResponse = this.sanitizeAssistantResponse(fullResponse);

      if (webGrounding?.citationsMarkdown) {
        const alreadyHasSources = webGrounding.sources.some((source) =>
          fullResponse.includes(source.url),
        );
        if (!alreadyHasSources && !/(^|\n)Sources:\s*$/im.test(fullResponse)) {
          const citations = webGrounding.citationsMarkdown;
          fullResponse = `${fullResponse.trimEnd()}${citations}`;
          groupStreamRegistry.updateResponse(groupId, fullResponse);
          groupSocketManager.broadcast(groupId, {
            type: "ai_stream",
            chunk: citations,
            tempId,
            done: false,
            username: assistantUsername,
            webSearchEnabled,
          });
        }
      }

      const metadata: any = {};
      if (webSearchEnabled) {
        metadata.webSearchEnabled = true;
      }
      if (clerkId) {
        metadata.requesterId = clerkId;
      }
      if (webGrounding && webGrounding.sources.length > 0) {
        metadata.sources = webGrounding.sources.map(
          ({ id, title, url, hostname, snippet }) => ({
            id,
            title,
            url,
            hostname,
            snippet,
          }),
        );
      }

      const { attachments: aiAttachments } = parseMultimedia(fullResponse);

      // Save final message
      const aiMsg = await GroupMessage.create({
        groupId,
        userId: "assistant",
        username: assistantUsername,
        role: "assistant",
        content: fullResponse,
        status: "completed",
        metadata,
        attachments: aiAttachments.length > 0 ? aiAttachments : undefined,
        model: targetProvider,
      });

      try {
        const promptText = serializePromptMessages(promptMessages as any[]);
        const promptAttachmentCount = promptMessages.reduce(
          (sum, m) => sum + (m.attachments?.length || 0),
          0,
        );

        let usage;
        try {
          usage = await stream.usage;
        } catch (e) {
          console.error("Failed to get stream usage for group chat:", e);
        }

        const tokens = usage || calculateUsage(
          promptText,
          fullResponse,
          promptAttachmentCount
        );

        await TokenUsageRecord.findOneAndUpdate(
          { messageId: aiMsg._id },
          {
            userId: clerkId || group.creatorId,
            chatId: groupId,
            role: "assistant",
            model: targetProvider,
            tokens,
          },
          { upsert: true, new: true }
        );
      } catch (tokenErr) {
        console.error("Failed to save assistant token usage in group:", tokenErr);
      }

      groupStreamRegistry.delete(groupId);

      groupSocketManager.broadcast(groupId, {
        type: "ai_stream",
        tempId,
        done: true,
        message: this.serializeGroupMessage(aiMsg),
      });
    } catch (err: any) {
      // If it was aborted, don't write generic error block since we handled it in stopGroupStream
      if (
        err?.name === "AbortError" ||
        activeStream.abortController.signal.aborted
      ) {
        groupStreamRegistry.delete(groupId);
        return;
      }

      console.error("AI Group Generation Error:", err);

      const errorContent = `**Failed to generate response.** The model \`${displayName}\` encountered an error or is temporarily unavailable. Please try again.`;

      // Save the error message so it persists in the chat history
      const errorMsg = await GroupMessage.create({
        groupId,
        userId: "assistant",
        username: assistantUsername,
        role: "assistant",
        content: errorContent,
        status: "failed",
        model: targetProvider,
      });

      groupStreamRegistry.delete(groupId);

      // Broadcast the error message to all SSE clients to clear the stream and show the error!
      groupSocketManager.broadcast(groupId, {
        type: "ai_stream",
        tempId,
        done: true,
        message: this.serializeGroupMessage(errorMsg),
      });
    }
  }

  static async stopGroupStream(groupId: string) {
    const activeStream = groupStreamRegistry.get(groupId);
    if (!activeStream) {
      return { stopped: false };
    }

    // Abort active generative query
    groupStreamRegistry.stop(groupId);

    const rawResponse = activeStream.fullResponse;
    const fullResponse =
      this.sanitizeAssistantResponse(rawResponse) ||
      "⚠️ Response generation stopped.";

    const { attachments: aiAttachments } = parseMultimedia(fullResponse);

    // Save final partial message
    const aiMsg = await GroupMessage.create({
      groupId,
      userId: "assistant",
      username: activeStream.assistantUsername,
      role: "assistant",
      content: fullResponse,
      status: "stopped",
      metadata: {
        ...(activeStream.webSearchEnabled ? { webSearchEnabled: true } : {}),
        ...(activeStream.requesterId ? { requesterId: activeStream.requesterId } : {}),
      },
      attachments: aiAttachments.length > 0 ? aiAttachments : undefined,
      model: activeStream.model,
    });

    try {
      const promptText = activeStream.promptMessages
        ? serializePromptMessages(activeStream.promptMessages)
        : "";
      const promptAttachmentCount = activeStream.promptMessages
        ? activeStream.promptMessages.reduce(
            (sum, m: any) => sum + (m.attachments?.length || 0),
            0,
          )
        : 0;

      const tokens = calculateUsage(promptText, fullResponse, promptAttachmentCount);

      const groupDoc = await GroupChat.findById(groupId);

      await TokenUsageRecord.findOneAndUpdate(
        { messageId: aiMsg._id },
        {
          userId: activeStream.clerkId || groupDoc?.creatorId || "unknown",
          chatId: groupId,
          role: "assistant",
          model: activeStream.targetProvider || "unknown",
          tokens,
        },
        { upsert: true, new: true }
      );
    } catch (tokenErr) {
      console.error("Failed to save assistant token usage in group stop:", tokenErr);
    }

    // Broadcast stopped message state
    groupSocketManager.broadcast(groupId, {
      type: "ai_stream",
      tempId: activeStream.tempId,
      done: true,
      message: this.serializeGroupMessage(aiMsg),
    });

    return { stopped: true };
  }

  static async getUserGroups(clerkId: string) {
    const groups = await GroupChat.find({ "members.userId": clerkId }).sort({
      isPinned: -1,
      updatedAt: -1,
    });
    return await this.populateGroupsMembers(groups);
  }

  static async getUserCreatedGroups(clerkId: string) {
    const groups = await GroupChat.find({ creatorId: clerkId }).sort({
      isPinned: -1,
      updatedAt: -1,
    });
    return await this.populateGroupsMembers(groups);
  }

  static async updateGroupTitle(
    groupId: string,
    title: string,
    clerkId: string,
  ) {
    const group = await GroupChat.findById(groupId);
    if (!group) throw new Error("Group not found");

    const isMember = group.members.some((m) => m.userId === clerkId);
    if (!isMember) {
      throw new Error("Unauthorized: Only members can rename this group");
    }

    group.title = title;
    await group.save();
    return await this.populateGroupMembers(group);
  }

  static async pinGroup(groupId: string) {
    const group = await GroupChat.findByIdAndUpdate(
      groupId,
      { isPinned: true, updatedAt: new Date() },
      { new: true },
    );
    if (!group) throw new Error("Group not found");
    return await this.populateGroupMembers(group);
  }

  static async unpinGroup(groupId: string) {
    const group = await GroupChat.findByIdAndUpdate(
      groupId,
      { isPinned: false, updatedAt: new Date() },
      { new: true },
    );
    if (!group) throw new Error("Group not found");
    return await this.populateGroupMembers(group);
  }

  static async editGroupMessage(
    groupId: string,
    messageId: string,
    content: string,
    targetProvider?: string,
    webSearchEnabled = false,
    attachments: any[] = [],
    attachedFile: Express.Multer.File | null = null,
  ) {
    const message = await GroupMessage.findById(messageId);
    if (!message) throw new Error("Message not found");

    // Check if it's an AI mention
    const match = content.match(/@([a-zA-Z0-9-:_/.]+)/);
    let isAiMention = false;
    if (match) {
      const mention = match[1].toLowerCase();
      const allProviders = await aiService.getAvailableProviders();
      isAiMention =
        mention === "velora" ||
        allProviders.some((p) => {
          const cleanName = p.id
            .split(":")
            .pop()
            ?.split("/")
            .pop()
            ?.toLowerCase();
          return cleanName === mention || p.id.toLowerCase() === mention;
        });
    }

    if (isAiMention) {
      // Delete all messages after this one
      await GroupMessage.deleteMany({
        groupId,
        createdAt: { $gt: message.createdAt },
      });
    }

    // Handle attachments
    let messageAttachments = [...attachments];

    if (attachedFile) {
      try {
        const result = await processAttachedFile(attachedFile, message.userId, messageAttachments);
        messageAttachments = result.attachments;
      } catch (err: any) {
        console.error("Failed to process attached file for edited group message:", err);
      }
    }

    // Update the message itself
    message.content = content;
    message.attachments = messageAttachments as any;
    message.metadata = {
      ...message.metadata,
      webSearchEnabled: Boolean(webSearchEnabled),
    };
    await message.save();

    // Broadcast the updated/edited user message
    groupSocketManager.broadcast(groupId, {
      type: "message_updated",
      message: this.serializeGroupMessage(message),
    });

    if (isAiMention) {
      // Delete subsequent messages locally on all clients
      groupSocketManager.broadcast(groupId, {
        type: "messages_deleted_after",
        messageId,
        createdAt: message.createdAt.toISOString(),
      });

      groupSocketManager.broadcast(groupId, {
        type: "ai_thinking",
        isThinking: true,
        webSearchEnabled,
        requesterId: message.userId,
      });

      this.handleAiResponse(groupId, content, webSearchEnabled, message.userId).catch(
        console.error,
      );
    }

    return message;
  }

  static async retryGroupMessage(
    groupId: string,
    messageId: string,
    targetProvider?: string,
    webSearchOverride?: boolean,
  ) {
    const assistantMessage = await this.findAssistantMessageForRetry(
      groupId,
      messageId,
    );

    if (!assistantMessage) {
      throw new Error("Assistant message not found for retry");
    }

    // Delete the assistant message itself and all messages after it
    await GroupMessage.deleteMany({
      groupId,
      createdAt: { $gte: assistantMessage.createdAt },
    });

    // Broadcast deletions to other clients so they clear them locally
    groupSocketManager.broadcast(groupId, {
      type: "messages_deleted_after",
      messageId,
      createdAt: assistantMessage.createdAt.toISOString(),
      inclusive: true,
    });

    // Find the last user message preceding the assistant message
    const lastUserMessage = await GroupMessage.findOne({
      groupId,
      role: "user",
      createdAt: { $lt: assistantMessage.createdAt },
    }).sort({ createdAt: -1 });

    if (!lastUserMessage) {
      throw new Error("No user message found to retry");
    }

    const webSearchEnabled = webSearchOverride !== undefined 
      ? webSearchOverride 
      : Boolean(lastUserMessage.metadata?.webSearchEnabled);

    // Trigger AI response regeneration
    groupSocketManager.broadcast(groupId, {
      type: "ai_thinking",
      isThinking: true,
      webSearchEnabled,
      requesterId: lastUserMessage.userId,
    });

    const finalProvider = targetProvider || assistantMessage.model;

    this.handleAiResponse(
      groupId,
      lastUserMessage.content,
      webSearchEnabled,
      lastUserMessage.userId,
      finalProvider,
    ).catch(console.error);

    return { success: true };
  }

  static async updateGroupMessageReaction(
    messageId: string,
    userId: string,
    username: string,
    reactionType: "like" | "dislike" | null,
  ) {
    const message = await GroupMessage.findById(messageId);
    if (!message) throw new Error("Message not found");

    // Always remove any existing reaction by this user first
    await GroupMessage.updateOne(
      { _id: messageId },
      { $pull: { reactions: { userId } } },
    );

    // If a new reaction type is specified, add it
    if (reactionType) {
      await GroupMessage.updateOne(
        { _id: messageId },
        { $push: { reactions: { userId, username, type: reactionType } } },
      );
    }

    // Re-fetch to get the final state
    const updated = await GroupMessage.findById(messageId);
    if (!updated) throw new Error("Message not found after update");

    // Broadcast the updated message state to everyone in the group
    groupSocketManager.broadcast(updated.groupId.toString(), {
      type: "message_updated",
      message: this.serializeGroupMessage(updated),
    });

    return updated;
  }

  static async deleteGroup(groupId: string, clerkId: string) {
    const group = await GroupChat.findById(groupId);
    if (!group) {
      throw new Error("Group not found");
    }
    if (group.creatorId !== clerkId) {
      throw new Error("Unauthorized: Only the creator can delete this group");
    }

    // Broadcast to all active SSE clients that the group is deleted
    groupSocketManager.broadcast(groupId, {
      type: "group_deleted",
      groupId,
    });

    // Delete group and its messages
    await GroupChat.findByIdAndDelete(groupId);
    await GroupMessage.deleteMany({ groupId });

    return { success: true };
  }

  private static async populateGroupMembers(group: any) {
    if (!group) return null;
    const groupObj = group.toObject ? group.toObject() : group;
    if (groupObj.members && groupObj.members.length > 0) {
      const userIds = groupObj.members.map((m: any) => m.userId);
      const users = await User.find({ clerkId: { $in: userIds } });
      const userMap = new Map(users.map((u: any) => [u.clerkId, u]));

      groupObj.members = groupObj.members.map((member: any) => {
        const user = userMap.get(member.userId);
        if (user) {
          const username = user.firstName || user.email?.split("@")[0] || member.username;
          const userImage = user.imageUrl || member.userImage;
          return {
            ...member,
            username,
            userImage,
          };
        }
        return member;
      });
    }
    return groupObj;
  }

  private static async populateGroupsMembers(groups: any[]) {
    if (!groups || groups.length === 0) return [];

    const allUserIds = new Set<string>();
    groups.forEach((group: any) => {
      const g = group.toObject ? group.toObject() : group;
      if (g.members) {
        g.members.forEach((m: any) => allUserIds.add(m.userId));
      }
    });

    const users = await User.find({ clerkId: { $in: Array.from(allUserIds) } });
    const userMap = new Map(users.map((u: any) => [u.clerkId, u]));

    return groups.map((group: any) => {
      const g = group.toObject ? group.toObject() : group;
      if (g.members) {
        g.members = g.members.map((member: any) => {
          const user = userMap.get(member.userId);
          if (user) {
            const username = user.firstName || user.email?.split("@")[0] || member.username;
            const userImage = user.imageUrl || member.userImage;
            return {
              ...member,
              username,
              userImage,
            };
          }
          return member;
        });
      }
      return g;
    });
  }
}
