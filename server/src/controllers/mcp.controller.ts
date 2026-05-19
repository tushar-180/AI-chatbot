import { Request, Response } from "express";
import { McpServer } from "../models/McpServer.model";
import { mcpClientService } from "../services/mcpClient.service";
import { userService } from "../services/user.service";

export const mcpController = {
  /**
   * Register or update an MCP server.
   */
  async registerServer(req: Request, res: Response) {
    try {
      const { name, type, command, args, url, env, enabled } = req.body;

      if (!name || !type) {
        return res.status(400).json({ error: "Name and type are required." });
      }

      if (type === "stdio" && !command) {
        return res.status(400).json({ error: "Command is required for stdio transport." });
      }

      if (type === "sse" && !url) {
        return res.status(400).json({ error: "URL is required for sse transport." });
      }

      // Upsert server config in DB
      const server = await McpServer.findOneAndUpdate(
        { name },
        { name, type, command, args, url, env, enabled: enabled !== false },
        { upsert: true, new: true }
      );

      // Connect if enabled
      if (server.enabled) {
        await mcpClientService.connect(server);
      } else {
        await mcpClientService.disconnect(server.name);
      }

      res.status(200).json({
        message: "Server registered successfully",
        server,
        connected: mcpClientService.getConnectionState(server.name),
      });
    } catch (error: any) {
      console.error("Error registering MCP server:", error);
      res.status(500).json({ error: error.message || "Failed to register server" });
    }
  },

  /**
   * List all registered MCP servers and their connection state.
   */
  async getServers(req: Request, res: Response) {
    try {
      const user = await userService.getUserByClerkId((req as any).clerkId!);
      const isAdmin = user?.get("role") === "admin";
      const disabledMcpServers = user?.get("disabledMcpServers") || [];

      let servers = await McpServer.find({});

      // If standard user, filter out globally disabled servers entirely
      if (!isAdmin) {
        servers = servers.filter((server) => server.enabled);
      }

      const result = servers.map((server) => {
        const isGloballyEnabled = server.enabled;
        const isDisabledByUser = disabledMcpServers.includes(server.name);
        return {
          ...server.toObject({ flattenMaps: true }),
          enabled: isGloballyEnabled && !isDisabledByUser,
          connected: mcpClientService.getConnectionState(server.name) && !isDisabledByUser,
        };
      });

      res.status(200).json(result);
    } catch (error) {
      console.error("Error in getServers:", error);
      res.status(500).json({ error: "Failed to fetch MCP servers" });
    }
  },

  /**
   * Toggle a server enabled status (starts/stops connection dynamically).
   */
  async toggleServer(req: Request, res: Response) {
    try {
      const { name } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled field must be a boolean." });
      }

      const server = await McpServer.findOne({ name });
      if (!server) {
        return res.status(404).json({ error: "Server not found." });
      }

      const currentUser = await userService.getUserByClerkId((req as any).clerkId!);
      const isAdmin = currentUser?.get("role") === "admin";

      if (isAdmin) {
        // Admins toggle the server status globally
        server.enabled = enabled;
        await server.save();

        if (enabled) {
          await mcpClientService.connect(server);
        } else {
          await mcpClientService.disconnect(server.name);
        }

        res.status(200).json({
          message: `Server ${enabled ? "enabled" : "disabled"} successfully`,
          server,
          connected: mcpClientService.getConnectionState(server.name),
        });
      } else {
        // Standard users only toggle for themselves
        if (!enabled) {
          // Deactivate for this user
          await currentUser?.updateOne({ $addToSet: { disabledMcpServers: name } });
        } else {
          // Activate for this user
          await currentUser?.updateOne({ $pull: { disabledMcpServers: name } });
        }

        // Return a mock server object where enabled reflects this user's state
        const updatedUser = await userService.getUserByClerkId((req as any).clerkId!);
        const isDisabledByUser = (updatedUser?.get("disabledMcpServers") as string[] || []).includes(name as string);

        res.status(200).json({
          message: `Server ${enabled ? "enabled" : "disabled"} successfully for you`,
          server: {
            ...server.toObject({ flattenMaps: true }),
            enabled: server.enabled && !isDisabledByUser,
          },
          connected: mcpClientService.getConnectionState(server.name) && !isDisabledByUser,
        });
      }
    } catch (error: any) {
      console.error("Error toggling MCP server:", error);
      res.status(500).json({ error: error.message || "Failed to toggle server" });
    }
  },

  /**
   * Delete an MCP server configuration and stop its process.
   */
  async deleteServer(req: Request, res: Response) {
    try {
      const { name } = req.params;

      const server = await McpServer.findOne({ name });
      if (!server) {
        return res.status(404).json({ error: "Server not found." });
      }

      await McpServer.deleteOne({ name });
      await mcpClientService.disconnect(name as string);

      res.status(200).json({ message: "Server deleted successfully", name });
    } catch (error: any) {
      console.error("Error deleting MCP server:", error);
      res.status(500).json({ error: error.message || "Failed to delete server" });
    }
  },

  /**
   * Fetch a list of active aggregated tools from connected servers.
   */
  async getActiveTools(req: Request, res: Response) {
    try {
      const user = await userService.getUserByClerkId((req as any).clerkId!);
      const disabledMcpServers = user?.get("disabledMcpServers") || [];
      const allTools = await mcpClientService.getActiveTools();
      const tools = allTools.filter((tool) => !disabledMcpServers.includes(tool._serverName));
      res.status(200).json({ tools });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get active tools" });
    }
  },
};
