import { Request, Response } from "express";
import { projectService } from "../services/project.service";
import { Chat } from "../models/Chat.model";
import { asyncHandler } from "../utils/asyncHandler";

interface AuthenticatedRequest extends Request {
  clerkId?: string;
}

export const createProject = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.clerkId!;
    const project = await projectService.createProject(userId, req.body);
    return res.status(201).json(project);
  } catch (error) {
    console.error("Error creating project:", error);
    const message = error instanceof Error ? error.message : "Failed to create project";
    return res.status(400).json({ error: message });
  }
});

export const getAllProjects = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projects = await projectService.getAllProjects(userId);
    return res.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return res.status(500).json({ error: "Failed to fetch projects" });
  }
});

export const getProjectById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projectId = String(req.params.id);
    const project = await projectService.getProject(userId, projectId);
    
    // Also fetch all chats belonging to this project
    const chats = await Chat.find({ projectId, userId }).sort({ updatedAt: -1 });
    
    return res.json({ project, chats });
  } catch (error) {
    console.error("Error fetching project:", error);
    const status = error instanceof Error && error.name === "NotFoundError" ? 404 : 500;
    const message = error instanceof Error ? error.message : "Failed to fetch project";
    return res.status(status).json({ error: message });
  }
});

export const updateProject = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projectId = String(req.params.id);
    const project = await projectService.updateProject(userId, projectId, req.body);
    return res.json(project);
  } catch (error) {
    console.error("Error updating project:", error);
    const message = error instanceof Error ? error.message : "Failed to update project";
    return res.status(400).json({ error: message });
  }
});

export const deleteProject = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projectId = String(req.params.id);
    await projectService.deleteProject(userId, projectId);
    return res.json({ message: "Project and all its chats deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    const message = error instanceof Error ? error.message : "Failed to delete project";
    return res.status(400).json({ error: message });
  }
});

// Add this controller
export const moveChatToProject = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projectId = req.params.projectId;
    const chatId = req.params.chatId;

    const chat = await Chat.findOneAndUpdate(
      { _id: chatId, userId },
      { projectId },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    return res.json(chat);
  } catch (error) {
    console.error("Error moving chat to project:", error);
    return res.status(500).json({ error: "Failed to move chat" });
  }
});
