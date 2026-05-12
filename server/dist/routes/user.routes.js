"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const router = (0, express_1.Router)();
router.post("/sync", user_controller_1.userController.syncUser);
router.get("/profile/:clerkId", user_controller_1.userController.getProfile);
router.put("/personalization/:clerkId", user_controller_1.userController.updatePersonalization);
exports.default = router;
