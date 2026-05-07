"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const memory_service_1 = require("../services/memory.service");
const UserMemory_model_1 = require("../models/UserMemory.model");
const router = (0, express_1.Router)();
/**
 * Get all memories for the current user
 * Includes pagination support
 */
router.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // SECURITY NOTE: In production, userId should come from a verified JWT (e.g. Clerk Middleware)
        // rather than a raw header to prevent spoofing.
        const userId = req.headers["x-user-id"];
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized: User ID is required" });
        }
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;
        const memories = yield memory_service_1.memoryService.getMemories(userId, limit, skip);
        res.json(memories);
    }
    catch (error) {
        console.error("Failed to fetch memories:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
/**
 * Delete a specific memory
 */
router.delete("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.headers["x-user-id"];
        const { id } = req.params;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        // Ensure the memory belongs to the user before deleting
        const result = yield UserMemory_model_1.UserMemory.deleteOne({ _id: id, userId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Memory not found or already deleted" });
        }
        res.json({ success: true, message: "Memory purged successfully" });
    }
    catch (error) {
        console.error("Failed to delete memory:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}));
exports.default = router;
