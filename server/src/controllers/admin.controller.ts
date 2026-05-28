import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { User } from "../models/User.model";
import { Chat, Message, TokenUsageRecord } from "../models/Chat.model";
import { AI_PROVIDERS } from "../services/ai/constants";

const normalizeModelName = (modelName: string): string => {
  if (!modelName) return "None";

  // 1. Split by ':' to get provider and path
  const parts = modelName.split(":");
  if (parts.length < 2) {
    const slashParts = modelName.split("/");
    return slashParts[slashParts.length - 1].trim();
  }

  const provider = parts[0].trim();
  const path = parts[parts.length - 1].trim();

  // 2. Take the last segment of the path (split by '/')
  const pathParts = path.split("/");
  const cleanModel = pathParts[pathParts.length - 1].trim();

  return `${provider}:${cleanModel}`;
};

// Generate set of valid normalized model names from AI_PROVIDERS to filter out obsolete/deleted/temporary test models
const getValidModelsSet = (): Set<string> => {
  const set = new Set<string>();
  Object.values(AI_PROVIDERS).forEach((provider) => {
    provider.models.forEach((model) => {
      set.add(normalizeModelName(`${provider.id}:${model}`));
    });
  });
  return set;
};

const validModels = getValidModelsSet();

export const adminController = {
  getStats: asyncHandler(async (req: Request, res: Response) => {
    try {
      // 1. Fetch total counts
      const totalUsersCount = await User.countDocuments();
      const totalChatsCount = await Chat.countDocuments();
      const totalMessagesCount = await Message.countDocuments();

      // 1.5 Fetch global token counts (from assistant messages only - they have accurate API-reported usage)
      const totalTokensResult = await TokenUsageRecord.aggregate([
        { $match: { role: "assistant" } },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: "$tokens.totalTokens" },
            promptTokens: { $sum: "$tokens.promptTokens" },
            completionTokens: { $sum: "$tokens.completionTokens" }
          }
        }
      ]);
      const totalTokens = totalTokensResult[0]?.totalTokens || 0;
      const totalPromptTokens = totalTokensResult[0]?.promptTokens || 0;
      const totalCompletionTokens = totalTokensResult[0]?.completionTokens || 0;

      // 2. Fetch global model usage analytics and tokens (keeps top model stat active)
      const globalModelUsage = await TokenUsageRecord.aggregate([
        { $match: { role: "assistant", model: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$model",
            count: { $sum: 1 },
            tokens: { $sum: "$tokens.totalTokens" },
            promptTokens: { $sum: "$tokens.promptTokens" },
            completionTokens: { $sum: "$tokens.completionTokens" }
          }
        },
      ]);

      // Normalize and group model usage counts & tokens in JS to prevent double-counting
      const modelCountsMap = new Map<string, { count: number; tokens: number; promptTokens: number; completionTokens: number }>();
      for (const item of globalModelUsage) {
        const normalized = normalizeModelName(item._id);
        const current = modelCountsMap.get(normalized) || { count: 0, tokens: 0, promptTokens: 0, completionTokens: 0 };
        modelCountsMap.set(normalized, {
          count: current.count + item.count,
          tokens: current.tokens + (item.tokens || 0),
          promptTokens: current.promptTokens + (item.promptTokens || 0),
          completionTokens: current.completionTokens + (item.completionTokens || 0)
        });
      }

      const mappedGlobalModelUsage = Array.from(modelCountsMap.entries())
        .map(([model, info]) => ({
          model,
          count: info.count,
          tokens: info.tokens,
          promptTokens: info.promptTokens,
          completionTokens: info.completionTokens,
          isAvailable: validModels.has(model)
        }))
        .sort((a, b) => {
          if (a.isAvailable !== b.isAvailable) {
            return a.isAvailable ? -1 : 1;
          }
          return b.tokens - a.tokens;
        }); // Sort by availability then total tokens

      // 3. Count total chats per user
      const chatStats = await Chat.aggregate([{ $group: { _id: "$userId", count: { $sum: 1 } } }]);
      const chatStatsMap = new Map(chatStats.map((stat) => [stat._id, stat.count]));

      // 4. Aggregate model usage per user based on messages, with normalization
      const userStats = await TokenUsageRecord.aggregate([
        { $match: { role: "assistant", model: { $exists: true, $ne: null } } },
        { 
          $group: { 
            _id: { userId: "$userId", model: "$model" }, 
            count: { $sum: 1 },
            totalTokens: { $sum: "$tokens.totalTokens" },
            promptTokens: { $sum: "$tokens.promptTokens" },
            completionTokens: { $sum: "$tokens.completionTokens" }
          } 
        },
      ]);

      // Normalize and find user-specific favorite model and breakdown
      interface ModelUsageItem {
        model: string;
        count: number;
        tokens: number;
        promptTokens: number;
        completionTokens: number;
      }

      interface UserAggregatedStats {
        favoriteModel: string;
        favoriteModelCount: number;
        modelUsage: ModelUsageItem[];
      }

      const userModelCounts = new Map<string, Map<string, ModelUsageItem>>();
      for (const item of userStats) {
        const userId = item._id.userId;
        const normalized = normalizeModelName(item._id.model);

        if (!userModelCounts.has(userId)) {
          userModelCounts.set(userId, new Map<string, ModelUsageItem>());
        }

        const modelMap = userModelCounts.get(userId)!;
        const current = modelMap.get(normalized) || { model: normalized, count: 0, tokens: 0, promptTokens: 0, completionTokens: 0 };
        
        modelMap.set(normalized, {
          model: normalized,
          count: current.count + item.count,
          tokens: current.tokens + (item.totalTokens || 0),
          promptTokens: current.promptTokens + (item.promptTokens || 0),
          completionTokens: current.completionTokens + (item.completionTokens || 0)
        });
      }

      const modelStatsMap = new Map<string, UserAggregatedStats>();
      for (const [userId, modelMap] of userModelCounts.entries()) {
        let favModel = "None";
        let maxCount = 0;
        const modelUsage: ModelUsageItem[] = [];

        for (const [model, stats] of modelMap.entries()) {
          modelUsage.push(stats);
          if (stats.count > maxCount) {
            maxCount = stats.count;
            favModel = model;
          }
        }

        // Sort model breakdown by highest token usage
        modelUsage.sort((a, b) => b.tokens - a.tokens);

        modelStatsMap.set(userId, {
          favoriteModel: favModel,
          favoriteModelCount: maxCount,
          modelUsage
        });
      }

      // 4.5 Aggregate token counts per user (assistant messages only for accurate provider-reported usage)
      const userTokenStats = await TokenUsageRecord.aggregate([
        { $match: { role: "assistant" } },
        {
          $group: {
            _id: "$userId",
            totalTokens: { $sum: "$tokens.totalTokens" },
            promptTokens: { $sum: "$tokens.promptTokens" },
            completionTokens: { $sum: "$tokens.completionTokens" }
          }
        }
      ]);
      const userTokenStatsMap = new Map(
        userTokenStats.map((stat) => [
          stat._id,
          {
            totalTokens: stat.totalTokens || 0,
            promptTokens: stat.promptTokens || 0,
            completionTokens: stat.completionTokens || 0
          }
        ])
      );

      // 5. Fetch all users from database
      const allUsers = await User.find({}).sort({ createdAt: -1 });

      // 6. Merge user profiles with aggregated stats
      const usersList = allUsers.map((user) => {
        const favoriteModelInfo = modelStatsMap.get(user.clerkId);
        const totalChats = chatStatsMap.get(user.clerkId) || 0;
        const tokenStats = userTokenStatsMap.get(user.clerkId) || { totalTokens: 0, promptTokens: 0, completionTokens: 0 };
        return {
          clerkId: user.clerkId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
          createdAt: user.get("createdAt"),
          lastSignInAt: user.lastSignInAt,
          role: user.get("role") || "user",
          favoriteModel: favoriteModelInfo ? favoriteModelInfo.favoriteModel : "None",
          modelUsage: favoriteModelInfo ? favoriteModelInfo.modelUsage : [],
          totalChats: totalChats,
          totalTokens: tokenStats.totalTokens,
          promptTokens: tokenStats.promptTokens,
          completionTokens: tokenStats.completionTokens,
        };
      });

      return res.status(200).json({
        totalUsersCount,
        totalChatsCount,
        totalMessagesCount,
        totalTokens,
        totalPromptTokens,
        totalCompletionTokens,
        globalModelUsage: mappedGlobalModelUsage,
        usersList,
      });
    } catch (error) {
      console.error("[adminController.getStats] Error:", error);
      return res.status(500).json({ error: "Failed to fetch admin stats" });
    }
  }),

  updateUserRole: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { clerkId } = req.params;
      const { role } = req.body;

      // Validate role
      if (role !== "user" && role !== "admin") {
        return res.status(400).json({ error: "Invalid role value. Must be 'user' or 'admin'" });
      }

      // Prevent self-demotion
      if (clerkId === req.clerkId) {
        return res.status(400).json({ error: "You cannot change your own administrative role." });
      }

      // Update user in DB
      const updatedUser = await User.findOneAndUpdate(
        { clerkId },
        { role },
        { returnDocument: "after" }
      );

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        message: `Successfully updated user role to ${role}`,
        user: {
          clerkId: updatedUser.clerkId,
          role: updatedUser.role,
        },
      });
    } catch (error) {
      console.error("[adminController.updateUserRole] Error:", error);
      return res.status(500).json({ error: "Failed to update user role" });
    }
  }),
};
