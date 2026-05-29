import { projectRepository } from "../../repositories/project.repository";
import { CreateProjectInput, UpdateProjectInput } from "../../types/project.types";
import { Chat, Message } from "../../models/Chat.model";

export const projectService = {
  async createProject(userId: string, data: CreateProjectInput) {
    if (!userId) throw new Error("User ID is required");
    if (!data.name?.trim()) throw new Error("Project name is required");
    return await projectRepository.create(userId, data);
  },

  async getProject(userId: string, projectId: string) {
    const project = await projectRepository.findByIdAndUser(projectId, userId);
    if (!project) {
      const error = new Error("Project not found");
      error.name = "NotFoundError";
      throw error;
    }
    return project;
  },

  async getAllProjects(userId: string) {
    if (!userId) throw new Error("User ID is required");
    return await projectRepository.findAllByUserId(userId);
  },

  async updateProject(userId: string, projectId: string, data: UpdateProjectInput) {
    // Verify ownership
    await this.getProject(userId, projectId);
    return await projectRepository.update(projectId, data);
  },

  async deleteProject(userId: string, projectId: string) {
    // Verify ownership
    await this.getProject(userId, projectId);
    
    // Find all chats belonging to the project
    const chats = await Chat.find({ projectId });
    const chatIds = chats.map((chat) => chat._id);
    
    // Delete all messages belonging to those chats
    if (chatIds.length > 0) {
      await Message.deleteMany({ chatId: { $in: chatIds } });
      await Chat.deleteMany({ _id: { $in: chatIds } });
    }
    
    return await projectRepository.deleteById(projectId);
  },
};
