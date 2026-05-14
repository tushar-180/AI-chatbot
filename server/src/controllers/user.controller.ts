import { Request, Response } from "express";
import { userService } from "../services/user.service";

export const userController = {
  async syncUser(req: Request, res: Response) {
    try {
      const userData = req.body;
      
      if (!userData.clerkId || !userData.email) {
        return res.status(400).json({ error: "clerkId and email are required" });
      }

      const user = await userService.syncUser(userData);
      res.status(200).json(user);
    } catch (error) {
      console.error("Error syncing user:", error);
      res.status(500).json({ error: "Failed to sync user" });
    }
  },

  async getProfile(req: Request, res: Response) {
    try {
      const clerkId = req.params.clerkId as string;
      const user = await userService.getUserByClerkId(clerkId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  },

  async updatePersonalization(req: Request, res: Response) {
    try {
      const clerkId = req.params.clerkId as string;
      const personalizationData = req.body;
      
      const user = await userService.updatePersonalization(clerkId, personalizationData);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.status(200).json(user);
    } catch (error) {
      console.error("Error updating personalization:", error);
      res.status(500).json({ error: "Failed to update personalization" });
    }
  },

  async exportData(req: Request, res: Response) {
    try {
      const clerkId = req.params.clerkId as string;
      const summary = await userService.exportData(clerkId);
      res.status(200).json({ summary });
    } catch (error) {
      console.error("Error exporting data:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  }
};
