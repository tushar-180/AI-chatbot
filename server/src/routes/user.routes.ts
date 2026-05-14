import { Router } from "express";
import { userController } from "../controllers/user.controller";

const router = Router();

router.post("/sync", userController.syncUser);
router.get("/profile/:clerkId", userController.getProfile);
router.put("/personalization/:clerkId", userController.updatePersonalization);
router.get("/export/:clerkId", userController.exportData);

export default router;
