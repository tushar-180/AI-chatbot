import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import app, { allowedOrigins } from "./app";
import { connectDB } from "./config/db";
import { groupSocketManager } from "./utils/groupSocket";

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
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
