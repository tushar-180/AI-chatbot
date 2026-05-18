import { Router } from "express";
import { adminController } from "../controllers/admin.controller";
import { requireAdmin } from "../middleware/auth.middleware";

const router = Router();

// Enforce requireAdmin check on stats endpoint
router.get("/stats", requireAdmin, adminController.getStats);

// Update user role
router.patch("/users/:clerkId/role", requireAdmin, adminController.updateUserRole);

export default router;
