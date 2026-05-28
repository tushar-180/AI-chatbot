import express from "express";
import { getConfig, updateConfig } from "../controllers/config.controller";

const router = express.Router();

router.get("/config", getConfig);
router.patch("/config", updateConfig);

export default router;
