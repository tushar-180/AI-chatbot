import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import app, { allowedOrigins } from "./app";
import { connectDB } from "./config/db";
import { groupSocketManager } from "./utils/groupSocket";
import { mcpClientService } from "./services/mcp/mcpClient.service";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

groupSocketManager.init(io);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server Running On Port ${PORT}`);

  // Connect to the database and initialize services after the port is open
  connectDB()
    .then(() => {
      // Initialize MCP client service in the background after database connection
      return mcpClientService.initialize();
    })
    .then(() => {
      console.log("[MCP] Dynamic client service initialized.");
    })
    .catch((err) => {
      console.error("Initialization error:", err);
    });
});

const handleShutdown = async () => {
  console.log("\nServer shutting down...");
  await mcpClientService.shutdownAll();
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
