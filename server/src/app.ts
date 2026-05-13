import express from "express";
import cors from "cors";
import chatRoutes from "./routes/chat.routes";
import aiRoutes from "./routes/ai.routes";
import userRoutes from "./routes/user.routes";
import uploadRoutes from "./routes/upload.routes";
import memoryRoutes from "./routes/memory.routes";
import sharedChatRoutes from "./routes/sharedChat.routes";
import morgan from "morgan";
import { errorHandler } from "./middleware/error.middleware";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
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

app.get("/", (req, res) => {
  const serverUrl =
    process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
  res.send(`API running... Server URL: ${serverUrl}`);
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/user", userRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/memory", memoryRoutes);
app.use("/api/shared-chat", sharedChatRoutes);

// Error Handler Middleware
app.use(errorHandler);

export default app;
