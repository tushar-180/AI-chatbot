import { Request, Response } from "express";
import { userService } from "../services/user/user.service";
import { createClerkClient } from "@clerk/express";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export const userController = {
  async getProfile(req: Request, res: Response) {
    try {
      const clerkId = req.clerkId!;
      const user = await userService.getUserByClerkId(clerkId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  },

  async updateProfile(req: Request, res: Response) {
    try {
      const clerkId = req.clerkId!;
      const { firstName, lastName, imageUrl } = req.body;

      const user = await userService.updateProfile(clerkId, { firstName, lastName, imageUrl });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Safe update to Clerk backend to sync names
      try {
        await clerk.users.updateUser(clerkId, {
          firstName: firstName?.trim(),
          lastName: lastName?.trim(),
        });
      } catch (clerkErr) {
        console.error("Failed to sync profile update to Clerk:", clerkErr);
      }

      res.status(200).json(user);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  },

  async updatePersonalization(req: Request, res: Response) {
    try {
      const clerkId = req.clerkId!;
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
      const clerkId = req.clerkId!;
      const summary = await userService.exportData(clerkId);
      res.status(200).json({ summary });
    } catch (error) {
      console.error("Error exporting data:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  },
};
