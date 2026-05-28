import express from "express";
import { getAvailableProviders, streamCompare } from "../controllers/ai.controller";

const router = express.Router();

router.get("/providers", getAvailableProviders);
router.post("/compare/stream", streamCompare);

export default router;
