import { GroupChat, GroupMessage } from "../models/GroupChat.model";
import { Message, Chat } from "../models/Chat.model";
import { User } from "../models/User.model";
import { groupSocketManager } from "../utils/groupSocket";
import { aiService } from "./ai.service";
import { BASE_SYSTEM_PROMPT } from "../constants/prompt.constants";
import {
  webSearchService,
  type WebGroundingContext,
} from "../modules/web-search";
import { groupStreamRegistry } from "./groupStreamRegistry.service";
import type { ChatMessage } from "../types/chat.types";
import type { AIMessage, AIRole } from "./ai/types";
import { parseMultimedia } from "../utils/chatHistory";
import crypto from "crypto";

export class GroupChatService {
  private static sanitizeAssistantResponse(content: string) {
    return content
      .replace(/^(?:\s*\[(?:velora(?:\s*\([^\]]+\))?)\]:\s*)+/i, "")
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
      metadata: message.metadata,
      sources: message.metadata?.sources || undefined,
      attachments: message.attachments || [],
    };
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
    }));

    if (groupMessages.length > 0) {
      await GroupMessage.insertMany(groupMessages);
    }

    return groupChat;
  }

  static async getGroupByInviteCode(inviteCode: string) {
    const group = await GroupChat.findOne({ inviteCode });
    return group;
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

    return group;
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
    return await GroupMessage.find({ groupId }).sort({ createdAt: 1 });
  }

  static async addMessage(
    groupId: string,
    clerkId: string,
    content: string,
    role: "user" | "assistant" = "user",
    webSearchEnabled = false,
    attachments: any[] = [],
  ) {
    const group = await GroupChat.findById(groupId);
    if (!group) throw new Error("Group not found");

    let username = "Velora";
    let userImage = null;

    if (role === "user") {
      const member = group.members.find((m) => m.userId === clerkId);
      if (!member) throw new Error("Not a member of this group");
      username = member.username;
      userImage = member.userImage;
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
      attachments,
    });

    groupSocketManager.broadcast(groupId, {
      type: "message",
      message: this.serializeGroupMessage(message),
    });

    // Handle Agent Mention
    const match = content.match(/@([a-zA-Z0-9-:_/.]+)/);
    if (match) {
      const mention = match[1].toLowerCase();
      const allProviders = aiService.getAvailableProviders();
      const isAiMention =
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
      if (isAiMention) {
        groupSocketManager.broadcast(groupId, {
          type: "ai_thinking",
          isThinking: true,
          webSearchEnabled,
        });
        this.handleAiResponse(groupId, content, webSearchEnabled).catch(
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
      const parsed = parseMultimedia(msg.content);
      const attachments = [
        ...(msg.attachments || []).map((att: any) => ({
          url: att.url,
          name: att.name,
          mimeType: att.mimeType,
          size: att.size,
        })),
        ...(parsed.attachments || []),
      ];
      return {
        role: msg.role as AIRole,
        content: parsed.content,
        username: msg.username,
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    });

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
    promptMessages.unshift({
      role: "system",
      content:
        BASE_SYSTEM_PROMPT +
        "\n\nThis is a group chat. Differentiate users by their usernames if provided in context. Never wrap usernames in brackets like [name]. You are Velora.",
    });

    if (webGrounding) {
      promptMessages.unshift({
        role: "system",
        content: webGrounding.systemPrompt,
      });
    }

    let targetProvider: string | undefined = undefined;
    const mentionMatch = userContent.match(/@([a-zA-Z0-9-:_/.]+)/);
    if (mentionMatch) {
      const mention = mentionMatch[1].toLowerCase();
      if (mention !== "velora" && mention !== "system") {
        const allProviders = aiService.getAvailableProviders();
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

    if (!targetProvider) {
      targetProvider = "gemini:gemini-3.1-flash-lite-preview";
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
    });

    try {
      const aiProvider = aiService.getProvider(targetProvider);
      const stream = await aiProvider.generateStreamResponse(
        promptMessages,
        activeStream.abortController.signal,
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

      // Save final message
      const aiMsg = await GroupMessage.create({
        groupId,
        userId: "assistant",
        username: assistantUsername,
        role: "assistant",
        content: fullResponse,
        status: "completed",
        metadata,
      });

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

      const errorContent = `⚠️ **Failed to generate response.** The model \`${displayName}\` encountered an error or is temporarily unavailable. Please try again.`;

      // Save the error message so it persists in the chat history
      const errorMsg = await GroupMessage.create({
        groupId,
        userId: "assistant",
        username: assistantUsername,
        role: "assistant",
        content: errorContent,
        status: "failed",
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

    // Save final partial message
    const aiMsg = await GroupMessage.create({
      groupId,
      userId: "assistant",
      username: activeStream.assistantUsername,
      role: "assistant",
      content: fullResponse,
      status: "stopped",
      metadata: activeStream.webSearchEnabled ? { webSearchEnabled: true } : {},
    });

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
    return await GroupChat.find({ "members.userId": clerkId }).sort({
      isPinned: -1,
      updatedAt: -1,
    });
  }

  static async getUserCreatedGroups(clerkId: string) {
    return await GroupChat.find({ creatorId: clerkId }).sort({
      isPinned: -1,
      updatedAt: -1,
    });
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
    return group;
  }

  static async pinGroup(groupId: string) {
    const group = await GroupChat.findByIdAndUpdate(
      groupId,
      { isPinned: true, updatedAt: new Date() },
      { new: true },
    );
    if (!group) throw new Error("Group not found");
    return group;
  }

  static async unpinGroup(groupId: string) {
    const group = await GroupChat.findByIdAndUpdate(
      groupId,
      { isPinned: false, updatedAt: new Date() },
      { new: true },
    );
    if (!group) throw new Error("Group not found");
    return group;
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
}
