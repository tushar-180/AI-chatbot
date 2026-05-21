import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUp, Edit2, Folder, Plus, Search, Sparkles, Trash2, X, MoreVertical, ChevronDown, LogOut } from "lucide-react";
import { useProjectStore } from "@/features/chat/store/useProjectStore";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useAvailableProviders } from "@/features/chat/hooks/useAvailableProviders";
import { Gemini, Anthropic, OpenAI, Nvidia } from "@lobehub/icons";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DeleteConfirmModal from "@/features/chat/components/DeleteConfirmModal";
import InputArea from "@/features/chat/components/InputArea";
import type { Attachment } from "@/features/chat/hooks/useChatInput";

function formatRelativeTime(isoString: string) {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recent";
  }
}

function ProjectIcon() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 transition-transform duration-200 group-hover:scale-105">
      <Folder size={16} />
    </div>
  );
}

interface ProjectRowProps {
  project: {
    _id: string;
    name: string;
    updatedAt: string;
  };
  onSelect: () => void;
  onRename: (e: React.MouseEvent, id: string, name: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

function ProjectRow({ project, onSelect, onRename, onDelete }: ProjectRowProps) {
  return (
    <div
      onClick={onSelect}
      className="group flex cursor-pointer items-center justify-between rounded-2xl border-b border-white/5 p-4 transition-all duration-200 hover:bg-white/2 last:border-b-0"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <ProjectIcon />
        <span className="truncate font-display text-[13.5px] font-semibold capitalize text-slate-100 transition-colors group-hover:text-white">
          {project.name}
        </span>
      </div>

      <div className="ml-4 flex shrink-0 items-center gap-5">
        <div className="flex items-center gap-1.5 opacity-0 transition-all duration-150 group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-all">
                <MoreVertical size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-2xl border border-white/5 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl">
              <DropdownMenuItem
                onClick={(e) => onRename(e, project._id, project.name)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
              >
                <Edit2 size={12} />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => onDelete(e, project._id)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-red-400 cursor-pointer"
              >
                <Trash2 size={12} />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span className="min-w-[70px] shrink-0 text-right text-[12.5px] font-semibold text-slate-500">
          {formatRelativeTime(project.updatedAt)}
        </span>
      </div>
    </div>
  );
}

interface ProjectsTableProps {
  projects: Array<{
    _id: string;
    name: string;
    updatedAt: string;
  }>;
  onSelectProject: (id: string) => void;
  onRenameProject: (e: React.MouseEvent, id: string, name: string) => void;
  onDeleteProject: (e: React.MouseEvent, id: string) => void;
}

function ProjectsTable({
  projects,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
}: ProjectsTableProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/5 bg-white/1 py-20 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
        No projects found
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex select-none items-center justify-between border-b border-white/5 px-4 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        <span>Name</span>
        <span className="min-w-[70px] text-right">Modified</span>
      </div>

      <div className="mt-2 flex flex-col overflow-hidden rounded-3xl border border-white/5 bg-slate-900/10 divide-y divide-white/5">
        {projects.map((project) => (
          <ProjectRow
            key={project._id}
            project={project}
            onSelect={() => onSelectProject(project._id)}
            onRename={onRenameProject}
            onDelete={onDeleteProject}
          />
        ))}
      </div>
    </div>
  );
}

interface NewProjectButtonProps {
  onClick: () => void;
}

function NewProjectButton({ onClick }: NewProjectButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-bold uppercase tracking-[0.1em] text-slate-950 shadow-lg shadow-emerald-500/10 transition-all hover:bg-emerald-400"
    >
      <Plus size={14} strokeWidth={3} />
      <span>New</span>
    </button>
  );
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative flex min-w-[140px] w-full max-w-[240px] items-center">
      <Search size={14} className="pointer-events-none absolute left-3 text-slate-500" />
      <input
        type="text"
        placeholder="Search projects..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/5 bg-slate-900 py-2 pl-9 pr-3.5 text-xs font-medium text-white outline-none transition-all placeholder:text-slate-500 focus:border-white/10"
      />
    </div>
  );
}

interface ProjectsHeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onNewProjectClick: () => void;
  onBack: () => void;
}

function ProjectsHeader({
  searchValue,
  onSearchChange,
  onNewProjectClick,
  onBack,
}: ProjectsHeaderProps) {
  return (
    <div className="flex w-full flex-col gap-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-slate-400 transition-all hover:bg-white/10 hover:text-white"
          title="Back to chat"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="select-none font-display text-2xl font-black tracking-tight text-white">
          Projects
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <SearchBar value={searchValue} onChange={onSearchChange} />
        <NewProjectButton onClick={onNewProjectClick} />
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projectId, chatId } = useParams<{ projectId?: string; chatId?: string }>();
  const {
    projects,
    loading,
    activeProject,
    projectChats,
    fetchProjects,
    createProject,
    deleteProject,
    updateProjectDetails,
    setActiveProjectId,
    removeChatFromProjectStore,
    updateChatInProjectStore,
  } = useProjectStore();

  const handleBackToChat = () => {
    setActiveProjectId(null);
    useChatStore.getState().setCurrentChat(null);
    useChatStore.getState().setMessages([]);
    useChatStore.getState().setIsNewChat(true);
    navigate("/chat");
  };

  const [searchValue, setSearchValue] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renamingType, setRenamingType] = useState<"project" | "chat">("project");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [deleteConfig, setDeleteConfig] = useState<{ id: string; type: "project" | "chat" } | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("gemini:gemini-2.5-pro");
  const { availableProviders } = useAvailableProviders(selectedProvider, setSelectedProvider);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (projectId) {
      setActiveProjectId(projectId);
      return;
    }

    setActiveProjectId(null);
  }, [projectId, setActiveProjectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const newProj = await createProject(newProjectName);
      toast.success("Project created successfully");
      setNewProjectName("");
      setIsModalOpen(false);
      navigate(`/projects/${newProj._id}`);
    } catch {
      toast.error("Failed to create project");
    }
  };

  const handleStartRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setRenamingType("project");
    setRenamingId(id);
    setRenamingName(name);
    setIsRenameModalOpen(true);
  };

  const handleStartRenameChat = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setRenamingType("chat");
    setRenamingId(id);
    setRenamingName(name);
    setIsRenameModalOpen(true);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingId || !renamingName.trim()) return;

    try {
      if (renamingType === "project") {
        await updateProjectDetails(renamingId, { name: renamingName.trim() });
        toast.success("Project renamed successfully");
      } else {
        await api.patch(`/chat/${renamingId}`, { title: renamingName.trim() });
        updateChatInProjectStore(renamingId, renamingName.trim());
        toast.success("Chat renamed successfully");
      }
      setIsRenameModalOpen(false);
      setRenamingId(null);
    } catch {
      toast.error(`Failed to rename ${renamingType}`);
    }
  };

  const handleDeleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfig({ id, type: "chat" });
  };

  const handleRemoveFromProject = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    try {
      await api.patch(`/chat/${chatId}/move`, { projectId: null });
      
      const chat = projectChats.find(c => c._id === chatId);
      removeChatFromProjectStore(chatId);
      
      if (chat) {
        useChatStore.getState().upsertChat({ ...chat, projectId: null });
      }
      
      toast.success("Chat removed from project");
    } catch (err) {
      toast.error("Failed to remove chat from project");
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfig({ id, type: "project" });
  };

  const filteredProjects = useMemo(
    () => projects.filter((proj) => proj.name.toLowerCase().includes(searchValue.toLowerCase())),
    [projects, searchValue],
  );

  const selectedProject =
    projectId && activeProject?._id === projectId
      ? activeProject
      : projects.find((project) => project._id === projectId) ?? null;

  const openProjectChat = (chatId: string) => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/chat/${chatId}`);
  };

  const handleStartNewProjectChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!projectId) return;
    navigate(`/projects/${projectId}/new`, {
      state: { 
        pendingInput: chatInput, 
        pendingProvider: selectedProvider,
        pendingAttachments: attachments,
        pendingWebSearch: webSearchEnabled,
      },
    });
  };


  return (
    <div className="min-h-screen flex-1 overflow-y-auto bg-slate-950 p-6 text-slate-100 md:p-10">
      <div className="mx-auto flex max-w-[1100px] flex-col px-4 pb-20 pt-10 md:px-8">
        <div className="flex flex-col gap-10">
          {!projectId && (
            <ProjectsHeader
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              onNewProjectClick={() => setIsModalOpen(true)}
              onBack={handleBackToChat}
            />
          )}

          {projectId ? (
            <div className="mx-auto flex w-full max-w-[780px] flex-col gap-8 pt-4">
              <div className="flex items-center gap-3 text-white">
                <button
                  type="button"
                  onClick={() => {
                    if (chatId) {
                      navigate(`/projects/${projectId}`);
                    } else {
                      navigate("/projects");
                    }
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-all hover:bg-white/10 hover:text-white"
                  title={chatId ? "Back to project" : "Back to projects"}
                >
                  <ArrowLeft size={18} />
                </button>
                <Folder size={28} strokeWidth={1.8} className="text-slate-200" />
                <h2 className="text-4xl font-medium tracking-tight text-white capitalize">
                  {selectedProject?.name || "Loading project"}
                </h2>
              </div>

              <div className="w-full relative z-10 pointer-events-auto -mb-8">
                <InputArea
                  input={chatInput}
                  onInputChange={setChatInput}
                  onSubmit={handleStartNewProjectChat}
                  loading={false}
                  isStreaming={false}
                  onStop={() => {}}
                  currentChatId={null}
                  selectedProvider={selectedProvider}
                  onProviderChange={setSelectedProvider}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  webSearchEnabled={webSearchEnabled}
                  onWebSearchToggle={setWebSearchEnabled}
                />
              </div>

              <div className="flex items-center gap-5">
                <button className="rounded-full border border-white/10 bg-[#111111] px-5 py-2 text-sm font-semibold text-white">
                  Chats
                </button>
              </div>

              {loading && !selectedProject ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                </div>
              ) : projectChats.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <p className="text-base text-slate-300">No chats in this project yet</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {projectChats.map((chat) => (
                    <div
                      key={chat._id}
                      onClick={() => openProjectChat(chat._id)}
                      className="group relative flex w-full cursor-pointer items-start justify-between border-b border-white/10 py-4 px-2 transition-all duration-200 hover:bg-white/[0.03] hover:px-4 rounded-xl"
                    >
                      <div className="flex-1 min-w-0 pr-6 text-left">
                        <p className="truncate text-[15px] font-semibold text-white">
                          {chat.title || "Untitled Chat"}
                        </p>
                        <p className="mt-1 truncate text-[15px] text-slate-300">
                          {chat.title || "Open this conversation"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pt-1">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button 
                                onClick={(e) => e.stopPropagation()}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-all"
                              >
                                <MoreVertical size={14} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 rounded-2xl border border-white/5 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl">
                              <DropdownMenuItem
                                onClick={(e) => handleStartRenameChat(e as any, chat._id, chat.title)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
                              >
                                <Edit2 size={12} />
                                <span>Rename</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => handleRemoveFromProject(e as any, chat._id)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-amber-400 cursor-pointer"
                              >
                                <LogOut size={12} />
                                <span>Remove from Project</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => handleDeleteChat(e as any, chat._id)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 size={12} />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <span className="text-sm text-slate-400">
                          {chat.updatedAt
                            ? new Date(chat.updatedAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })
                            : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading && projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Loading projects...
              </span>
            </div>
          ) : (
            <ProjectsTable
              projects={filteredProjects}
              onSelectProject={(id) => navigate(`/projects/${id}`)}
              onRenameProject={handleStartRename}
              onDeleteProject={handleDelete}
            />
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-white/5 bg-slate-900 p-6 shadow-2xl shadow-black/80 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
                <Sparkles size={14} />
                <span>New Project</span>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setNewProjectName("");
                }}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Project Name
                </label>
                <input
                  autoFocus
                  required
                  type="text"
                  placeholder="e.g. Mobile Design Audit"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full rounded-xl border border-white/5 bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white outline-none transition-all placeholder:text-slate-600 focus:border-emerald-500/20"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setNewProjectName("");
                  }}
                  className="flex h-8 cursor-pointer items-center justify-center rounded-xl bg-white/5 px-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-all hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex h-8 cursor-pointer items-center justify-center rounded-xl bg-emerald-500 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-950 shadow-lg shadow-emerald-500/10 transition-all hover:bg-emerald-400"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRenameModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-white/5 bg-slate-900 p-6 shadow-2xl shadow-black/80 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Rename {renamingType === "project" ? "Project" : "Chat"}
              </span>
              <button
                onClick={() => {
                  setIsRenameModalOpen(false);
                  setRenamingId(null);
                }}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveRename} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  New {renamingType === "project" ? "Project" : "Chat"} Name
                </label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={renamingName}
                  onChange={(e) => setRenamingName(e.target.value)}
                  className="w-full rounded-xl border border-white/5 bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-white outline-none transition-all placeholder:text-slate-600 focus:border-emerald-500/20"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsRenameModalOpen(false);
                    setRenamingId(null);
                  }}
                  className="flex h-8 cursor-pointer items-center justify-center rounded-xl bg-white/5 px-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-all hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex h-8 cursor-pointer items-center justify-center rounded-xl bg-emerald-500 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-950 shadow-lg shadow-emerald-500/10 transition-all hover:bg-emerald-400"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DeleteConfirmModal
        isOpen={!!deleteConfig}
        onClose={() => setDeleteConfig(null)}
        onConfirm={async () => {
          if (!deleteConfig) return;
          try {
            if (deleteConfig.type === "project") {
              await deleteProject(deleteConfig.id);
              toast.success("Project deleted successfully");
              if (projectId === deleteConfig.id) {
                navigate("/projects", { replace: true });
              }
            } else {
              await api.delete(`/chat/${deleteConfig.id}`);
              removeChatFromProjectStore(deleteConfig.id);
              toast.success("Chat deleted successfully");
            }
          } catch {
            toast.error(`Failed to delete ${deleteConfig.type}`);
          }
          setDeleteConfig(null);
        }}
        title={deleteConfig?.type === "project" ? "Delete Project?" : "Delete Chat?"}
        message={
          deleteConfig?.type === "project"
            ? "Are you sure you want to delete this project? All chats inside this project will be lost."
            : "Are you sure you want to delete this chat? This action cannot be undone."
        }
        purpose="Delete"
      />
    </div>
  );
}
