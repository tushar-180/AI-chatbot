import { Router } from "express";
import * as TemporaryChatController from "../controllers/temporaryChat.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/stream", requireAuth, TemporaryChatController.createTemporaryChatStream);

export default router;
