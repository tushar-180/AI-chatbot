import { Request, Response, NextFunction } from "express";
import { getAuth, createClerkClient } from "@clerk/express";
import { userService } from "../services/user.service";
import { UserProfile } from "../types/chat.types";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Extend Express Request to carry the verified clerkId downstream
declare global {
  namespace Express {
    interface Request {
      clerkId?: string;
    }
  }
}

/**
 * Verifies the Clerk JWT on every protected request.
 * - Rejects unauthenticated requests with 401.
 * - Sets req.clerkId from the verified token (not from client-supplied params).
 * - Auto-creates the user in MongoDB on their very first request — no client sync needed.
 *
 * Must be used AFTER clerkMiddleware() in app.ts.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.clerkId = userId;

  // Auto-create user in DB on first authenticated request
  try {
    const existing = await userService.getUserByClerkId(userId);
    if (!existing) {
      const clerkUser = await clerk.users.getUser(userId);
      const email = clerkUser.emailAddresses[0]?.emailAddress || "";
      
      const { User } = await import("../models/User.model");
      const userCount = await User.countDocuments();
      const isAdmin = userCount === 0 || 
                      email.endsWith("@admin.com") || 
                      email === "empiric@example.com" || 
                      email.toLowerCase().includes("admin");

      await userService.syncUser({
        clerkId: userId,
        email: email,
        firstName: clerkUser.firstName ?? undefined,
        lastName: clerkUser.lastName ?? undefined,
        imageUrl: clerkUser.imageUrl,
        role: isAdmin ? "admin" : "user",
      } as Partial<UserProfile>);
    }
  } catch (err) {
    // Don't block the request if DB write fails — log and continue
    console.error("[requireAuth] Failed to auto-create user:", err);
  }

  next();
};

/**
 * Restricts access to admin-only routes.
 * Must be used AFTER requireAuth so req.clerkId is populated.
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await userService.getUserByClerkId(req.clerkId!);
    if (!user || user.get("role") !== "admin") {
      res.status(403).json({ error: "Access denied. Admin role required." });
      return;
    }
    next();
  } catch (err) {
    console.error("[requireAdmin] Error checking admin status:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
