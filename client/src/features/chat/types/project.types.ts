import type { Chat } from "@/features/chat/types/chat.types";

export interface Project {
  _id: string;
  userId: string;
  name: string;
  description: string;
  instructions: string;
  memory: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetailsResponse {
  project: Project;
  chats: Chat[];
}
