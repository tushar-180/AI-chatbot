import { Router } from "express";
import * as TemporaryChatController from "../controllers/temporaryChat.controller";
import { requireAuth } from "../middleware/auth.middleware";
import multer from "multer";
import os from "node:os";

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.post("/stream", requireAuth, upload.single("file"), TemporaryChatController.createTemporaryChatStream);

export default router;
