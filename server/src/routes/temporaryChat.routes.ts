import { Router } from "express";
import * as TemporaryChatController from "../controllers/temporaryChat.controller";
import { requireAuth } from "../middleware/auth.middleware";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.post("/stream", requireAuth, upload.single("file"), TemporaryChatController.createTemporaryChatStream);

export default router;
