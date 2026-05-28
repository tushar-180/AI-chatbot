import { Request, Response } from "express";
import { AppConfig } from "../models/AppConfig.model";
import { AI_PROVIDERS } from "../services/ai/constants";
import { groupSocketManager } from "../utils/groupSocket";

export const getConfig = async (req: Request, res: Response) => {
  try {
    let config = await AppConfig.findOne({ singletonId: "global" }).lean();
    if (!config) {
      config = await AppConfig.create({ singletonId: "global" });
    }

    // Format all static providers to send to the frontend
    const allProviders = Object.values(AI_PROVIDERS).map(p => ({
      id: p.id,
      name: p.id.toUpperCase(),
      models: p.models.map(m => ({
        id: `${p.id}:${m}`,
        name: m
      }))
    }));

    return res.json({
      config,
      allProviders
    });
  } catch (error) {
    console.error("Error fetching config:", error);
    return res.status(500).json({ error: "Failed to fetch config" });
  }
};

export const updateConfig = async (req: Request, res: Response) => {
  try {
    const { disabledProviders, disabledModels } = req.body;
    
    let config = await AppConfig.findOne({ singletonId: "global" });
    if (!config) {
      config = new AppConfig({ singletonId: "global" });
    }

    if (Array.isArray(disabledProviders)) {
      config.disabledProviders = disabledProviders;
    }
    
    if (Array.isArray(disabledModels)) {
      config.disabledModels = disabledModels;
    }

    await config.save();
    groupSocketManager.broadcastGlobal("config_updated");
    return res.json({ config });
  } catch (error) {
    console.error("Error updating config:", error);
    return res.status(500).json({ error: "Failed to update config" });
  }
};
