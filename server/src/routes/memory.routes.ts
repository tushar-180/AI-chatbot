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
    const userId = req.clerkId!;
    
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;

    const memories = await memoryService.getMemories(userId, limit, skip);
    const totalCount = await UserMemory.countDocuments({ userId });
    
    res.json({ memories, totalCount });
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
    const userId = req.clerkId!;
    const { id } = req.params;

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
