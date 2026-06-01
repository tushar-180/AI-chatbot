import { projectRepository } from "../../repositories/project.repository";
import { CreateProjectInput, UpdateProjectInput } from "../../types/project.types";
import { chatRepository } from "../../repositories/chat.repository";

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

  async getProjectWithChats(userId: string, projectId: string) {
    const project = await this.getProject(userId, projectId);
    const chats = await chatRepository.findAllByProjectAndUser(projectId, userId);
    return { project, chats };
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
    await this.getProject(userId, projectId);
    await chatRepository.deleteManyByProjectId(projectId);
    return await projectRepository.deleteById(projectId);
  },

  async moveChatToProject(userId: string, projectId: string, chatId: string) {
    await this.getProject(userId, projectId);
    const chat = await chatRepository.moveToProject(chatId, userId, projectId);

    if (!chat) {
      const error = new Error("Chat not found");
      error.name = "NotFoundError";
      throw error;
    }

    return chat;
  },
};
