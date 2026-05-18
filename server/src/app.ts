import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import chatRoutes from "./routes/chat.routes";
import aiRoutes from "./routes/ai.routes";
import userRoutes from "./routes/user.routes";
import uploadRoutes from "./routes/upload.routes";
import memoryRoutes from "./routes/memory.routes";
import sharedChatRoutes from "./routes/sharedChat.routes";
import morgan from "morgan";
import { errorHandler } from "./middleware/error.middleware";
import { requireAuth } from "./middleware/auth.middleware";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  //"https://qpqhnchb-5173.inc1.devtunnels.ms",//ani
  "https://44g0q4j6-5173.inc1.devtunnels.ms", // line-to-remove
  process.env.CLIENT_URL,
  "https://khz5bstr-5173.inc1.devtunnels.ms"
].filter(Boolean) as string[];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(morgan("dev"));

// Parse Clerk auth state on every request (does not enforce auth by itself)
app.use(clerkMiddleware());

app.get("/", (req, res) => {
  const serverUrl =
    process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
  res.send(`API running... Server URL: ${serverUrl}`);
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/chat", requireAuth, chatRoutes);
app.use("/api/ai", requireAuth, aiRoutes);
app.use("/api/user", requireAuth, userRoutes);
app.use("/api/upload", requireAuth, uploadRoutes);
app.use("/api/memory", requireAuth, memoryRoutes);
app.use("/api/shared-chat", sharedChatRoutes);

// Error Handler Middleware
app.use(errorHandler);

export default app;
