import { Router } from "express";
import multer from "multer";
import os from "node:os";
import fs from "node:fs/promises";
import { cloudinaryService } from "../services/cloudinary.service";

const router = Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/image", upload.single("image"), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const fileBuffer = await fs.readFile(req.file.path);
      const url = await cloudinaryService.uploadImage(fileBuffer);
      res.status(200).json({ url });
    } finally {
      if (req.file.path) {
        await fs.unlink(req.file.path).catch(console.error);
      }
    }
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

export default router;
