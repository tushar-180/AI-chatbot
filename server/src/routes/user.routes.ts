import { Router } from "express";
import { userController } from "../controllers/user.controller";

const router = Router();

router.post("/sync", userController.syncUser);
router.get("/profile/:clerkId", userController.getProfile);

export default router;
