import { Request, Response } from "express";
import { projectService } from "../services/project/project.service";
import { asyncHandler } from "../utils/asyncHandler";
import { sendControllerError } from "../utils/controller";

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId!;
    const project = await projectService.createProject(userId, req.body);
    return res.status(201).json(project);
  } catch (error) {
    return sendControllerError(res, error, "Failed to create project");
  }
});

export const getAllProjects = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projects = await projectService.getAllProjects(userId);
    return res.json(projects);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fetch projects");
  }
});

export const getProjectById = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projectId = String(req.params.id);
    const result = await projectService.getProjectWithChats(userId, projectId);
    return res.json(result);
  } catch (error) {
    return sendControllerError(res, error, "Failed to fetch project");
  }
});

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projectId = String(req.params.id);
    const project = await projectService.updateProject(userId, projectId, req.body);
    return res.json(project);
  } catch (error) {
    return sendControllerError(res, error, "Failed to update project");
  }
});

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projectId = String(req.params.id);
    await projectService.deleteProject(userId, projectId);
    return res.json({ message: "Project and all its chats deleted successfully" });
  } catch (error) {
    return sendControllerError(res, error, "Failed to delete project");
  }
});

export const moveChatToProject = asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.clerkId!;
    const projectId = String(req.params.projectId);
    const chatId = String(req.params.chatId);
    const chat = await projectService.moveChatToProject(userId, projectId, chatId);
    return res.json(chat);
  } catch (error) {
    return sendControllerError(res, error, "Failed to move chat");
  }
});
