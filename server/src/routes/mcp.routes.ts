import express from "express";
import { mcpController } from "../controllers/mcp.controller";

const router = express.Router();

/**
 * POST /api/mcp
 * Register or update an MCP server configuration.
 */
router.post("/", mcpController.registerServer);

/**
 * GET /api/mcp
 * List all registered MCP server configurations and their connection state.
 */
router.get("/", mcpController.getServers);

/**
 * GET /api/mcp/tools
 * Aggregate list of active tools from all connected MCP servers.
 */
router.get("/tools", mcpController.getActiveTools);

/**
 * PATCH /api/mcp/:name/toggle
 * Toggle enabled status of an MCP server (boots up or kills process/connection).
 */
router.patch("/:name/toggle", mcpController.toggleServer);

/**
 * DELETE /api/mcp/:name
 * Delete an MCP server configuration and stop its connection/process.
 */
router.delete("/:name", mcpController.deleteServer);

export default router;
