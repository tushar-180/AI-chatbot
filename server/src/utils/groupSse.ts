import { EventEmitter } from "events";
import { Response } from "express";
import { writeSse } from "./sse";

class GroupSseManager {
  private events = new EventEmitter();
  private connections = new Map<string, Set<Response>>();

  constructor() {
    this.events.setMaxListeners(0);
  }

  addConnection(groupId: string, res: Response) {
    if (!this.connections.has(groupId)) {
      this.connections.set(groupId, new Set());
    }
    this.connections.get(groupId)!.add(res);

    res.on("close", () => {
      this.connections.get(groupId)?.delete(res);
      if (this.connections.get(groupId)?.size === 0) {
        this.connections.delete(groupId);
      }
    });
  }

  broadcast(groupId: string, data: any) {
    const clients = this.connections.get(groupId);
    if (clients) {
      clients.forEach((res) => {
        writeSse(res, data);
      });
    }
  }
}

export const groupSseManager = new GroupSseManager();
