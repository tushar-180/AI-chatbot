import { Request, Response } from "express";
import { GroupChatService } from "../services/groupChat.service";
import { groupSseManager } from "../utils/groupSse";
import { setSseHeaders } from "../utils/sse";

export class GroupChatController {
  static async createGroup(req: Request, res: Response) {
    console.log("Create Group called with:", req.body);
    try {
      const { chatId, userId } = req.body;
      const clerkId = (userId as string) || (req as any).auth?.userId || (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      if (!chatId) return res.status(400).json({ error: "chatId is required" });

      const group = await GroupChatService.createGroup(chatId as string, clerkId);
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
      const clerkId = (userId as string) || (req as any).auth?.userId || (req.headers["x-user-id"] as string);
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
      const clerkId = (userId as string) || (req as any).auth?.userId || (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const result = await GroupChatService.leaveGroup(groupId, clerkId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getGroupDetails(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const userId = req.query.userId as string;
      const clerkId = userId || (req as any).auth?.userId || (req.headers["x-user-id"] as string);
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
      const { content, userId } = req.body;
      const clerkId = (userId as string) || (req as any).auth?.userId || (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const message = await GroupChatService.addMessage(groupId, clerkId, content);
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async subscribeToGroup(req: Request, res: Response) {
    try {
      const groupId = req.params.groupId as string;
      const userId = req.query.userId as string;
      const clerkId = userId || (req as any).auth?.userId || (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      setSseHeaders(res);
      groupSseManager.addConnection(groupId, res);
      
      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(`: keep-alive\n\n`);
      }, 30000);

      res.on("close", () => {
        clearInterval(keepAlive);
      });
    } catch (error: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      }
    }
  }

  static async getUserGroups(req: Request, res: Response) {
    try {
      const userId = req.query.userId as string;
      const clerkId = userId || (req as any).auth?.userId || (req.headers["x-user-id"] as string);
      if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

      const groups = await GroupChatService.getUserGroups(clerkId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
