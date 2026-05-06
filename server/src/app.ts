import express from "express";
import cors from "cors";
import chatRoutes from "./routes/chat.routes";
import aiRoutes from "./routes/ai.routes";
import userRoutes from "./routes/user.routes";
import uploadRoutes from "./routes/upload.routes";
import memoryRoutes from "./routes/memory.routes";
import morgan from "morgan";
import { errorHandler } from "./middleware/error.middleware";

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://code-bot-1-z2qi.onrender.com",
      "http://localhost:4173",
      "https://nhqwqwv2-5173.inc1.devtunnels.ms",
    ],
  }),
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.send("API running...");
});

app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/user", userRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/memory", memoryRoutes);

// Error Handler Middleware
app.use(errorHandler);



export default app;
