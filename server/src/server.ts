import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import app, { allowedOrigins } from "./app";
import { connectDB } from "./config/db";
import { groupSocketManager } from "./utils/groupSocket";
import { mcpClientService } from "./services/mcpClient.service";

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  mcpClientService.initialize().then(() => {
    console.log("[MCP] Dynamic client service initialized.");
  }).catch(err => {
    console.error("[MCP] Initialization error:", err);
  });

  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  groupSocketManager.init(io);

  httpServer.listen(PORT, () => {
    console.log(`Server Running On Port ${PORT}`);
  });
});

const handleShutdown = async () => {
  console.log("\nServer shutting down...");
  await mcpClientService.shutdownAll();
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

