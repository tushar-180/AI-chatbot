import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GroupMember = {
  userId: string;
  username: string;
  userImage?: string;
  joinedAt: Date;
};

export type GroupMessage = {
  _id: string;
  groupId: string;
  userId: string;
  username: string;
  userImage?: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: "streaming" | "stopped" | "completed" | "failed";
  type: "text" | "image" | "file" | "action" | "event";
  createdAt: string;
  metadata?: {
    webSearchEnabled?: boolean;
    [key: string]: any;
  };
  sources?: Array<{
    id: number;
    url: string;
    title: string;
    hostname?: string;
    snippet?: string;
  }>;
  attachments?: any[];
  isWebSearching?: boolean;
};

export type GroupChat = {
  _id: string;
  title: string;
  creatorId: string;
  members: GroupMember[];
  inviteCode: string;
  updatedAt: string;
  isPinned?: boolean;
};

type GroupState = {
  groups: GroupChat[];
  currentGroupId: string | null;
  groupMessages: GroupMessage[];
  loading: boolean;
  isAiThinking: boolean;
  isWebSearching: boolean;

  setGroups: (groups: GroupChat[]) => void;
  addGroup: (group: GroupChat) => void;
  setCurrentGroup: (id: string | null) => void;
  setGroupMessages: (
    messages: GroupMessage[] | ((prev: GroupMessage[]) => GroupMessage[]),
  ) => void;
  addGroupMessage: (message: GroupMessage) => void;
  setLoading: (loading: boolean) => void;
  setIsAiThinking: (isAiThinking: boolean) => void;
  setIsWebSearching: (isWebSearching: boolean) => void;
  removeGroup: (id: string) => void;
  updateGroupMembers: (groupId: string, members: GroupMember[]) => void;
  updateGroup: (groupId: string, updates: Partial<GroupChat>) => void;
};

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      groups: [],
      currentGroupId: null,
      groupMessages: [],
      loading: false,
      isAiThinking: false,
      isWebSearching: false,

      setGroups: (groups) => set({ groups }),
      addGroup: (group) =>
        set((state) => ({
          groups: [group, ...state.groups.filter((g) => g._id !== group._id)],
        })),
      setCurrentGroup: (id) => set({ currentGroupId: id }),
      setGroupMessages: (messages) =>
        set((state) => ({
          groupMessages:
            typeof messages === "function"
              ? messages(state.groupMessages)
              : messages,
        })),
      addGroupMessage: (message) =>
        set((state) => ({
          groupMessages: [...state.groupMessages, message],
        })),
      setLoading: (loading) => set({ loading }),
      setIsAiThinking: (isAiThinking) => set({ isAiThinking }),
      setIsWebSearching: (isWebSearching) => set({ isWebSearching }),
      removeGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g._id !== id),
          currentGroupId:
            state.currentGroupId === id ? null : state.currentGroupId,
        })),
      updateGroupMembers: (groupId, members) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g._id === groupId ? { ...g, members } : g,
          ),
        })),
      updateGroup: (groupId, updates) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g._id === groupId ? { ...g, ...updates } : g,
          ),
        })),
    }),
    {
      name: "group-storage",
    },
  ),
);
