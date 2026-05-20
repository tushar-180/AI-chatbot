import { Server } from "socket.io";

class GroupSocketManager {
  private io: Server | null = null;

  init(io: Server) {
    this.io = io;

    io.on("connection", (socket) => {
      const { groupId, userId } = socket.handshake.query;
      console.log(`[Socket] Connected: ${socket.id}, user: ${userId}, group: ${groupId}`);

      if (groupId) {
        const roomName = `group:${groupId}`;
        socket.join(roomName);
        console.log(`[Socket] ${socket.id} joined room ${roomName}`);
      }

      socket.on("typing", (data: { isTyping: boolean; username: string }) => {
        if (groupId) {
          const roomName = `group:${groupId}`;
          socket.to(roomName).emit("user_typing", {
            groupId,
            userId,
            username: data.username,
            isTyping: data.isTyping,
          });
        }
      });

      socket.on("disconnect", () => {
        console.log(`[Socket] Disconnected: ${socket.id}`);
        if (groupId && userId) {
          const roomName = `group:${groupId}`;
          socket.to(roomName).emit("user_typing", {
            groupId,
            userId,
            isTyping: false,
          });
        }
      });
    });
  }

  broadcast(groupId: string, data: any) {
    if (this.io) {
      const roomName = `group:${groupId}`;
      this.io.to(roomName).emit("group_event", data);
      console.log(`[Socket] Broadcasted event to room ${roomName}:`, data.type);
    } else {
      console.warn("[Socket] not initialized, cannot broadcast");
    }
  }
}

export const groupSocketManager = new GroupSocketManager();
