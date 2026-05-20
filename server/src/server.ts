import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { connectDB } from "./config/db";
import { mcpClientService } from "./services/mcpClient.service";

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  mcpClientService
    .initialize()
    .then(() => {
      console.log("[MCP] Dynamic client service initialized.");
    })
    .catch((err) => {
      console.error("[MCP] Initialization error:", err);
    });

  app.listen(PORT, () => {
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
