import { Router } from "express";
import multer from "multer";
import { cloudinaryService } from "../services/cloudinary.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/image", upload.single("image"), async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const url = await cloudinaryService.uploadImage(req.file.buffer);
    res.status(200).json({ url });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

export default router;
