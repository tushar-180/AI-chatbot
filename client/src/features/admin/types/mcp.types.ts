export type McpTransport = "stdio" | "sse";

export interface McpServerConfig {
  _id?: string;
  name: string;
  type: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, unknown>;
  enabled: boolean;
  connected?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface McpToolProperty {
  type?: string;
  description?: string;
  enum?: unknown[];
  [key: string]: unknown;
}

export interface McpToolSchema {
  type?: string;
  properties?: Record<string, McpToolProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface McpTool {
  name: string;
  description?: string;
  _serverName?: string;
  inputSchema?: McpToolSchema;
}

export interface McpServerFormState {
  serverName: string;
  serverType: McpTransport;
  command: string;
  argsString: string;
  sseUrl: string;
  envString: string;
}
