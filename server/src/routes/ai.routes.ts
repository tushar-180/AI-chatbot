import express from "express";
import { getAvailableProviders } from "../controllers/ai.controller";

const router = express.Router();

router.get("/providers", getAvailableProviders);

export default router;
