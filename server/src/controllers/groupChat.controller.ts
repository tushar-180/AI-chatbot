import { Request, Response } from "express";
import { GroupChatService } from "../services/groupChat.service";

export class GroupChatController {
  static async createGroup(req: Request, res: Response) {
    console.log("Create Group called with:", req.body);
    try {
      const { chatId, userId } = req.body;
      const clerkId =
        (userId as string) ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

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
      const { userId } = req.body;
      const clerkId =
        (userId as string) ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const group = await GroupChatService.joinGroup(inviteCode, clerkId);
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async leaveGroup(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const { userId } = req.body;
      const clerkId =
        (userId as string) ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const result = await GroupChatService.leaveGroup(groupId, clerkId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async removeMember(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const { memberId, userId } = req.body;
      const adminClerkId =
        (userId as string) ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!adminClerkId) return res.status(401).json({ error: "Unauthorized" });
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
      const userId = req.query.userId as string;
      const clerkId =
        userId ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const messages = await GroupChatService.getGroupMessages(groupId);
      res.json({ messages });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async sendMessage(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const { content, userId, webSearchEnabled, attachments } = req.body;
      const clerkId =
        (userId as string) ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const message = await GroupChatService.addMessage(
        groupId,
        clerkId,
        content,
        "user",
        Boolean(webSearchEnabled),
        attachments || [],
      );
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getUserGroups(req: Request, res: Response) {
    try {
      const userId = req.query.userId as string;
      const clerkId =
        userId ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const groups = await GroupChatService.getUserGroups(clerkId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getUserCreatedGroups(req: Request, res: Response) {
    try {
      const userId = req.query.userId as string;
      const clerkId =
        userId ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const groups = await GroupChatService.getUserCreatedGroups(clerkId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteGroup(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const { userId } = req.body;
      const clerkId =
        (userId as string) ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

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
      const { title, userId } = req.body;
      const clerkId =
        (userId as string) ||
        (req as any).auth?.userId ||
        (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

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
      const { content, provider, webSearchEnabled } = req.body;

      const message = await GroupChatService.editGroupMessage(
        groupId,
        messageId,
        content,
        provider,
        Boolean(webSearchEnabled),
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
      const provider = req.body?.provider;

      const result = await GroupChatService.retryGroupMessage(
        groupId,
        messageId,
        provider,
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
      const { feedback } = req.body;

      const message = await GroupChatService.updateGroupMessageFeedback(
        messageId,
        feedback,
      );
      res.json(message);
    } catch (error: any) {
      console.error("Error in updateGroupMessageFeedback:", error);
      res.status(500).json({ error: error.message });
    }
  }
}
