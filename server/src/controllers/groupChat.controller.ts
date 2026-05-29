import { Request, Response } from "express";
import { GroupChatService } from "../services/chat/groupChat.service";
import { resolveClerkId, parseRequestBody } from "../utils/requestParser";

export class GroupChatController {
  static async createGroup(req: Request, res: Response) {
    console.log("Create Group called with:", req.body);
    try {
      const { chatId } = req.body;
      const clerkId = resolveClerkId(req);

      if (!chatId) return res.status(400).json({ error: "chatId is required" });

      const group = await GroupChatService.createGroup(
        chatId as string,
        clerkId,
      );
      res.json(group);
    } catch (error: any) {
      console.error("Error in createGroup:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getGroupByInviteCode(req: Request, res: Response) {
    try {
      const inviteCode = req.params.inviteCode as string;
      const group = await GroupChatService.getGroupByInviteCode(inviteCode);
      if (!group) return res.status(404).json({ error: "Group not found" });
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async joinGroup(req: Request, res: Response) {
    try {
      const inviteCode = req.params.inviteCode as string;
      const clerkId = resolveClerkId(req);

      const group = await GroupChatService.joinGroup(inviteCode, clerkId);
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async leaveGroup(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const clerkId = resolveClerkId(req);

      const result = await GroupChatService.leaveGroup(groupId, clerkId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async removeMember(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const { memberId } = req.body;
      const adminClerkId = resolveClerkId(req);
      if (!memberId)
        return res.status(400).json({ error: "Member ID is required" });

      const result = await GroupChatService.removeMember(
        groupId,
        adminClerkId,
        memberId,
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getGroupDetails(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const clerkId = resolveClerkId(req);

      const messages = await GroupChatService.getGroupMessages(groupId);
      res.json({ messages });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async sendMessage(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const { content } = req.body;
      const clerkId = resolveClerkId(req);
      const parsed = parseRequestBody(req);

      const message = await GroupChatService.addMessage(
        groupId,
        clerkId,
        content,
        "user",
        Boolean(parsed.webSearchEnabled),
        parsed.attachments || [],
        parsed.attachedFile,
      );
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getUserGroups(req: Request, res: Response) {
    try {
      const clerkId = resolveClerkId(req);

      const groups = await GroupChatService.getUserGroups(clerkId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getUserCreatedGroups(req: Request, res: Response) {
    try {
      const clerkId = resolveClerkId(req);

      const groups = await GroupChatService.getUserCreatedGroups(clerkId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteGroup(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const clerkId = resolveClerkId(req);

      const result = await GroupChatService.deleteGroup(groupId, clerkId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async stopStream(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const result = await GroupChatService.stopGroupStream(groupId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateGroupTitle(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const { title } = req.body;
      const clerkId = resolveClerkId(req);

      const group = await GroupChatService.updateGroupTitle(
        groupId,
        title,
        clerkId,
      );
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async pinGroup(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const group = await GroupChatService.pinGroup(groupId);
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async unpinGroup(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const group = await GroupChatService.unpinGroup(groupId);
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async editGroupMessage(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const messageId = req.params.messageId as string;
      const { content, provider } = req.body;
      const parsed = parseRequestBody(req);

      const message = await GroupChatService.editGroupMessage(
        groupId,
        messageId,
        content,
        provider,
        Boolean(parsed.webSearchEnabled),
        parsed.attachments,
        parsed.attachedFile
      );
      res.json(message);
    } catch (error: any) {
      console.error("Error in editGroupMessage:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async retryGroupMessage(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const messageId = req.params.messageId as string;
      const provider = req.body?.targetProvider;
      const webSearchEnabled = req.body?.webSearchEnabled;

      const result = await GroupChatService.retryGroupMessage(
        groupId,
        messageId,
        provider,
        webSearchEnabled,
      );
      res.json(result);
    } catch (error: any) {
      console.error("Error in retryGroupMessage:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async updateGroupMessageFeedback(req: Request, res: Response) {
    try {
      const messageId = req.params.messageId as string;
      const { feedback, username } = req.body;
      const userId = resolveClerkId(req);

      const message = await GroupChatService.updateGroupMessageReaction(
        messageId,
        userId,
        username,
        feedback,
      );
      res.json(message);
    } catch (error: any) {
      console.error("Error in updateGroupMessageFeedback:", error);
      res.status(500).json({ error: error.message });
    }
  }
}
