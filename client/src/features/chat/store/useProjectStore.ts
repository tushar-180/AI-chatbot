import { create } from "zustand";
import { api } from "@/lib/api";
import type { Project, ProjectDetailsResponse } from "../types/project.types";
import type { Chat } from "@/features/chat/types/chat.types";

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  projectChats: Chat[];
  loading: boolean;
  
  fetchProjects: () => Promise<void>;
  fetchProjectDetails: (projectId: string) => Promise<void>;
  createProject: (name: string) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  updateProjectDetails: (
    projectId: string,
    updates: { instructions?: string; memory?: string; name?: string }
  ) => Promise<void>;
  setActiveProjectId: (id: string | null) => void;
  
  isProjectDetailsOpen: boolean;
  setProjectDetailsOpen: (open: boolean) => void;
  
  // Local store helpers to sync state immediately
  addChatToProjectStore: (chat: Chat) => void;
  removeChatFromProjectStore: (chatId: string) => void;
  updateChatInProjectStore: (chatId: string, title: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activeProject: null,
  projectChats: [],
  loading: false,
  isProjectDetailsOpen: true,
  setProjectDetailsOpen: (open) => set({ isProjectDetailsOpen: open }),

  fetchProjects: async () => {
    set({ loading: true });
    try {
      const res = await api.get<Project[]>("/projects");
      set({ projects: res.data, loading: false });
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      set({ loading: false });
    }
  },

  fetchProjectDetails: async (projectId: string) => {
    set({ loading: true });
    try {
      const res = await api.get<ProjectDetailsResponse>(`/projects/${projectId}`);
      set({
        activeProject: res.data.project,
        projectChats: res.data.chats,
        loading: false,
      });
    } catch (err) {
      console.error(`Failed to fetch project details for ${projectId}:`, err);
      set({ loading: false });
    }
  },

  createProject: async (name: string) => {
    try {
      const res = await api.post<Project>("/projects", { name });
      const newProject = res.data;
      set((state) => ({
        projects: [newProject, ...state.projects],
      }));
      return newProject;
    } catch (err) {
      console.error("Failed to create project:", err);
      throw err;
    }
  },

  deleteProject: async (projectId: string) => {
    try {
      await api.delete(`/projects/${projectId}`);
      set((state) => ({
        projects: state.projects.filter((p) => p._id !== projectId),
        activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
        activeProject: state.activeProjectId === projectId ? null : state.activeProject,
        projectChats: state.activeProjectId === projectId ? [] : state.projectChats,
      }));
    } catch (err) {
      console.error("Failed to delete project:", err);
      throw err;
    }
  },

  renameProject: async (projectId: string, name: string) => {
    try {
      const res = await api.patch<Project>(`/projects/${projectId}`, { name });
      const updated = res.data;
      set((state) => ({
        projects: state.projects.map((p) => (p._id === projectId ? updated : p)),
        activeProject: state.activeProject?._id === projectId ? updated : state.activeProject,
      }));
    } catch (err) {
      console.error("Failed to rename project:", err);
      throw err;
    }
  },

  updateProjectDetails: async (projectId: string, updates: { instructions?: string; memory?: string; name?: string }) => {
    try {
      const res = await api.patch<Project>(`/projects/${projectId}`, updates);
      const updated = res.data;
      set((state) => ({
        projects: state.projects.map((p) => (p._id === projectId ? updated : p)),
        activeProject: state.activeProject?._id === projectId ? updated : state.activeProject,
      }));
    } catch (err) {
      console.error("Failed to update project details:", err);
      throw err;
    }
  },

  setActiveProjectId: (id: string | null) => {
    if (id === null) {
      set({ activeProjectId: null, activeProject: null, projectChats: [] });
    } else {
      set({ activeProjectId: id });
      get().fetchProjectDetails(id);
    }
  },

  addChatToProjectStore: (chat: Chat) => {
    set((state) => {
      // Sync list
      const exists = state.projectChats.some((c) => c._id === chat._id);
      const updatedChats = exists
        ? state.projectChats.map((c) => (c._id === chat._id ? chat : c))
        : [chat, ...state.projectChats];
      
      // Touch project updatedAt
      const updatedActiveProject = state.activeProject
        ? { ...state.activeProject, updatedAt: new Date().toISOString() }
        : null;

      // Also sort by updatedAt desc
      const sortedChats = [...updatedChats].sort(
        (a, b) => new Date(b.updatedAt || "").getTime() - new Date(a.updatedAt || "").getTime()
      );

      return {
        projectChats: sortedChats,
        activeProject: updatedActiveProject,
      };
    });
  },

  removeChatFromProjectStore: (chatId: string) => {
    set((state) => ({
      projectChats: state.projectChats.filter((c) => c._id !== chatId),
    }));
  },

  updateChatInProjectStore: (chatId: string, title: string) => {
    set((state) => ({
      projectChats: state.projectChats.map((c) =>
        c._id === chatId ? { ...c, title, updatedAt: new Date().toISOString() } : c
      ).sort(
        (a, b) => new Date(b.updatedAt || "").getTime() - new Date(a.updatedAt || "").getTime()
      ),
    }));
  },
}));
