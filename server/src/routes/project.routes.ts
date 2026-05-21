import { Router } from "express";
import * as ProjectController from "../controllers/project.controller";

const router = Router();

// Create project
router.post("/", ProjectController.createProject);

// Get all projects
router.get("/", ProjectController.getAllProjects);

// Get project details and its chats
router.get("/:id", ProjectController.getProjectById);

// Update project (rename, description, instructions, memory)
router.patch("/:id", ProjectController.updateProject);

// Delete project
router.delete("/:id", ProjectController.deleteProject);

export default router;
