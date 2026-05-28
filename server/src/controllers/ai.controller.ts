import { Request, Response } from "express";
import { aiService } from "../services/ai.service";

export const getAvailableProviders = async (_req: Request, res: Response) => {
  try {
    const providers = await aiService.getAvailableProviders();
    return res.json({ providers });
  } catch (error) {
    console.error("Error fetching AI providers:", error);
    return res.status(500).json({ error: "Failed to fetch AI providers" });
  }
};
