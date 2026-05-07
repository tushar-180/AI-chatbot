"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const ai_routes_1 = __importDefault(require("./routes/ai.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const memory_routes_1 = __importDefault(require("./routes/memory.routes"));
const morgan_1 = __importDefault(require("morgan"));
const error_middleware_1 = require("./middleware/error.middleware");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: [
        "http://localhost:5173",
        "https://code-bot-1-z2qi.onrender.com",
        "http://localhost:4173",
        "https://nhqwqwv2-5173.inc1.devtunnels.ms",
    ],
}));
app.use(express_1.default.json());
app.use((0, morgan_1.default)("dev"));
app.get("/", (req, res) => {
    res.send("API running...");
});
app.use("/api/chat", chat_routes_1.default);
app.use("/api/ai", ai_routes_1.default);
app.use("/api/user", user_routes_1.default);
app.use("/api/upload", upload_routes_1.default);
app.use("/api/memory", memory_routes_1.default);
// Error Handler Middleware
app.use(error_middleware_1.errorHandler);
exports.default = app;
