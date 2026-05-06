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
exports.userController = void 0;
const user_service_1 = require("../services/user.service");
exports.userController = {
    syncUser(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const userData = req.body;
                if (!userData.clerkId || !userData.email) {
                    return res.status(400).json({ error: "clerkId and email are required" });
                }
                const user = yield user_service_1.userService.syncUser(userData);
                res.status(200).json(user);
            }
            catch (error) {
                console.error("Error syncing user:", error);
                res.status(500).json({ error: "Failed to sync user" });
            }
        });
    },
    getProfile(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const clerkId = req.params.clerkId;
                const user = yield user_service_1.userService.getUserByClerkId(clerkId);
                if (!user) {
                    return res.status(404).json({ error: "User not found" });
                }
                res.status(200).json(user);
            }
            catch (error) {
                res.status(500).json({ error: "Failed to fetch profile" });
            }
        });
    }
};
