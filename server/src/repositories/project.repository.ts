import { Project } from "../models/Project.model";
import { CreateProjectInput, UpdateProjectInput } from "../types/project.types";

export const projectRepository = {
  async create(userId: string, data: CreateProjectInput) {
    const project = new Project({
      userId,
      ...data,
    });
    return await project.save();
  },

  async findById(projectId: string) {
    return await Project.findById(projectId);
  },

  async findByIdAndUser(projectId: string, userId: string) {
    return await Project.findOne({ _id: projectId, userId });
  },

  async findAllByUserId(userId: string) {
    return await Project.find({ userId }).sort({ updatedAt: -1 });
  },

  async update(projectId: string, data: UpdateProjectInput) {
    return await Project.findByIdAndUpdate(
      projectId,
      { $set: data },
      { new: true }
    );
  },

  async touchProject(projectId: string) {
    return await Project.findByIdAndUpdate(projectId, {
      $set: { updatedAt: new Date() },
    });
  },

  async deleteById(projectId: string) {
    return await Project.findByIdAndDelete(projectId);
  },
};
