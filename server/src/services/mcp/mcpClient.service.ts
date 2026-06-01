import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "../../models/McpServer.model";
import { EventSource } from "eventsource";

// Set global EventSource for SSE transport if not already defined (required by SSEClientTransport in Node environment)
if (typeof global.EventSource === "undefined") {
  (global as any).EventSource = EventSource;
}

interface ActiveConnection {
  client: Client;
  transport: any;
  config: any;
}

class McpClientService {
  private activeConnections = new Map<string, ActiveConnection>();
  private isInitialized = false;

  /**
   * Initialize all enabled MCP servers stored in the database.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const servers = await McpServer.find({ enabled: true });
      console.log(`[MCP] Found ${servers.length} enabled MCP server configurations.`);

      for (const server of servers) {
        try {
          await this.connect(server);
        } catch (err) {
          console.error(`[MCP] Failed to connect to server "${server.name}":`, err);
        }
      }
      this.isInitialized = true;
    } catch (error) {
      console.error("[MCP] Initialization error:", error);
    }
  }

  /**
   * Connect to an MCP server configuration.
   */
  async connect(serverConfig: any): Promise<void> {
    const { name, type, command, args, url, env } = serverConfig;

    if (this.activeConnections.has(name)) {
      console.log(`[MCP] Server "${name}" is already connected. Disconnecting first.`);
      await this.disconnect(name);
    }

    console.log(`[MCP] Connecting to server "${name}" via ${type}...`);

    let transport: any;

    if (type === "stdio") {
      if (!command) {
        throw new Error(`Command is required for stdio transport on server "${name}"`);
      }

      // Merge config environment variables with process.env
      const mergedEnv = {
        ...process.env,
        ...(env instanceof Map ? Object.fromEntries(env) : env || {}),
      };

      transport = new StdioClientTransport({
        command,
        args: args || [],
        env: mergedEnv as Record<string, string>,
      });
    } else if (type === "sse") {
      if (!url) {
        throw new Error(`SSE URL is required for sse transport on server "${name}"`);
      }
      transport = new StreamableHTTPClientTransport(new URL(url));
    } else {
      throw new Error(`Unsupported transport type: ${type}`);
    }

    const client = new Client(
      {
        name: "VeloraAI-Client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    console.log(`[MCP] Connected successfully to server "${name}"!`);

    this.activeConnections.set(name, {
      client,
      transport,
      config: serverConfig,
    });
  }

  /**
   * Disconnect a single connected MCP server.
   */
  async disconnect(name: string): Promise<void> {
    const connection = this.activeConnections.get(name);
    if (!connection) return;

    console.log(`[MCP] Disconnecting server "${name}"...`);
    try {
      await connection.client.close();
    } catch (err) {
      console.error(`[MCP] Error closing client for server "${name}":`, err);
    }
    this.activeConnections.delete(name);
  }

  /**
   * Disconnect and clean up all connections.
   */
  async shutdownAll(): Promise<void> {
    console.log("[MCP] Shutting down all active MCP connections...");
    for (const name of this.activeConnections.keys()) {
      await this.disconnect(name);
    }
    this.isInitialized = false;
  }

  /**
   * Get all active connections.
   */
  getConnections(): ActiveConnection[] {
    return Array.from(this.activeConnections.values());
  }

  /**
   * Get the connection state of a specific server.
   */
  getConnectionState(name: string): boolean {
    return this.activeConnections.has(name);
  }

  /**
   * Fetch and aggregate all tools from active MCP servers,
   * namespacing tool names to prevent conflicts (e.g. "sqlite__query").
   */
  async getActiveTools(): Promise<any[]> {
    const aggregatedTools: any[] = [];

    for (const [serverName, connection] of this.activeConnections.entries()) {
      try {
        const response = await connection.client.listTools();
        if (response && response.tools) {
          for (const tool of response.tools) {
            aggregatedTools.push({
              ...tool,
              // Namespace original tool name
              name: `${serverName}__${tool.name}`,
              _originalName: tool.name,
              _serverName: serverName,
            });
          }
        }
      } catch (err) {
        console.error(`[MCP] Failed to list tools from server "${serverName}":`, err);
      }
    }

    return aggregatedTools;
  }

  /**
   * Execute a namespaced tool (e.g. "sqlite__query") via the appropriate MCP server.
   */
  async executeTool(namespacedName: string, args: any): Promise<any> {
    const delimiterIndex = namespacedName.indexOf("__");
    if (delimiterIndex === -1) {
      throw new Error(`Invalid namespaced tool name: "${namespacedName}"`);
    }

    const serverName = namespacedName.substring(0, delimiterIndex);
    const originalToolName = namespacedName.substring(delimiterIndex + 2);

    const connection = this.activeConnections.get(serverName);
    if (!connection) {
      throw new Error(`MCP server "${serverName}" is not connected or active.`);
    }

    console.log(`[MCP] Executing tool "${originalToolName}" on server "${serverName}"...`);
    try {
      const result = await connection.client.callTool({
        name: originalToolName,
        arguments: args,
      });
      console.log(`[MCP] Tool "${originalToolName}" succeeded.`);
      return result;
    } catch (error: any) {
      console.error(`[MCP] Error executing tool "${originalToolName}" on server "${serverName}":`, error);
      throw error;
    }
  }
}

export const mcpClientService = new McpClientService();
