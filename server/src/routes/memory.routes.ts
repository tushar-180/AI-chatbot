import { Router } from "express";
import { memoryService } from "../services/memory.service";
import { UserMemory } from "../models/UserMemory.model";

const router = Router();

/**
 * Get all memories for the current user
 * Includes pagination support
 */
router.get("/", async (req, res) => {
  try {
    // SECURITY NOTE: In production, userId should come from a verified JWT (e.g. Clerk Middleware)
    // rather than a raw header to prevent spoofing.
    const userId = req.headers["x-user-id"] as string;
    
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: User ID is required" });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;

    const memories = await memoryService.getMemories(userId, limit, skip);
    res.json(memories);
  } catch (error) {
    console.error("Failed to fetch memories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Delete a specific memory
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Ensure the memory belongs to the user before deleting
    const result = await UserMemory.deleteOne({ _id: id, userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Memory not found or already deleted" });
    }
    
    res.json({ success: true, message: "Memory purged successfully" });
  } catch (error) {
    console.error("Failed to delete memory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
