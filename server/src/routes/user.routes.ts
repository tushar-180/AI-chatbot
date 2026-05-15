import { Router } from "express";
import { userController } from "../controllers/user.controller";

const router = Router();

// clerkId is no longer in the URL — it comes from the verified JWT (req.clerkId)
router.get("/profile", userController.getProfile);
router.put("/personalization", userController.updatePersonalization);
router.get("/export", userController.exportData);

export default router;
