/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import {
  X,
  User,
  Settings,
  Brain,
  Archive,
  Shield,
  LogOut,
  Sparkles,
  Zap,
  Briefcase,
  MessageSquare,
  Save,
  Loader2,
  Trash2,
  History,
  ArrowLeft,
  FileText,
  Download,
  Copy,
  Check,
  XCircle,
  Share,
  Users,
  Globe,
  Sliders,
  WifiOff,
  GitBranch,
  Database,
  RefreshCw,
  Camera,
  Pencil,
} from "lucide-react";
import { useUser, SignOutButton } from "@clerk/react";

import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useChatList } from "@/features/chat/hooks/useChatList";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useGroupStore } from "@/features/chat/store/useGroupStore";


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}



const TONE_OPTIONS = [
  "Default",
  "Professional",
  "Casual",
  "Enthusiastic",
  "Concise",
  "Detailed",
  "Friendly",
];

const LIMIT = 20;

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = "general",
}) => {
  const { user } = useUser();
  const navigate = useNavigate();
  const {
    deleteChat: globalDeleteChat,
    unarchiveChat: globalUnarchiveChat,
  } = useChatList();
  const {
    setCurrentChat,
    setMessages,
    setIsNewChat,
    setSidebarOpen,
    dbUser,
    setDbUser,
  } = useChatStore();
  const {
    removeGroup,
    currentGroupId,
    setCurrentGroup,
  } = useGroupStore();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // Edit Profile States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Initialize edit fields when edit mode is toggled or user changes
  useEffect(() => {
    if (user) {
      setEditFirstName(dbUser?.firstName || user.firstName || "");
      setEditLastName(dbUser?.lastName || user.lastName || "");
      setPreviewUrl(dbUser?.imageUrl || user.imageUrl || "");
      setSelectedFile(null);
    }
  }, [user, dbUser, isEditingProfile]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      let imageUrl = dbUser?.imageUrl || user.imageUrl;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("image", selectedFile);
        
        const uploadRes = await api.post("/upload/image", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        imageUrl = uploadRes.data.url;
      }

      const { data: updatedProfile } = await api.put("/user/profile", {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
        imageUrl,
      });

      // Update global DB user state
      setDbUser(updatedProfile);

      // Keep Clerk's local user metadata updated too
      await user.update({
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
      });

      toast.success("Profile updated successfully");
      setIsEditingProfile(false);
    } catch (error: any) {
      console.error("Save Profile Error:", error);
      toast.error(error.response?.data?.error || error.message || "Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setIsEditingProfile(false); // Reset profile edit mode on modal open
      setMobileView("list"); // Reset mobile view back to options list on modal open
    }
  }, [isOpen, initialTab]);
  const [mouseDownOnBackdrop, setMouseDownOnBackdrop] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  interface McpServerInfo {
    name: string;
    type: "stdio" | "sse";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    enabled: boolean;
    connected?: boolean;
  }

  // MCP Plugins & Apps State
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [isMcpLoading, setIsMcpLoading] = useState(false);
  const [isMcpActionLoading, setIsMcpActionLoading] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);

  // Fetch MCP Servers
  const fetchMcpServers = useCallback(async () => {
    setIsMcpLoading(true);
    setMcpError(null);
    try {
      const { data } = await api.get("/mcp");
      setMcpServers(data);
    } catch (error) {
      console.error("Failed to fetch MCP integrations:", error);
      setMcpError("Could not synchronize with MCP Registry");
    } finally {
      setIsMcpLoading(false);
    }
  }, []);

  // Toggle MCP Server Connection State
  const toggleMcpServer = async (name: string, currentEnabled: boolean) => {
    setIsMcpActionLoading(name);
    try {
      // Optimistic Update
      setMcpServers(prev =>
        prev.map(s => (s.name === name ? { ...s, enabled: !currentEnabled } : s))
      );
      
      const { data } = await api.patch(`/mcp/${name}/toggle`, { enabled: !currentEnabled });
      toast.success(data.message || `Server connection updated`);
      
      // Update with exact status returned
      setMcpServers(prev =>
        prev.map(s => (s.name === name ? { ...s, enabled: data.server.enabled, connected: data.connected } : s))
      );
    } catch (error) {
      console.error("Failed to toggle MCP server:", error);
      toast.error(`Failed to modify connection status`);
      // Revert Optimistic Update
      setMcpServers(prev =>
        prev.map(s => (s.name === name ? { ...s, enabled: currentEnabled } : s))
      );
    } finally {
      setIsMcpActionLoading(null);
    }
  };

  const reconnectMcpServer = async (name: string) => {
    setIsMcpActionLoading(name);
    try {
      const { data } = await api.post(`/mcp/${name}/reconnect`);
      setMcpServers(prev => 
        prev.map(s => s.name === name ? { ...s, ...data.server, connected: data.connected } : s)
      );
      toast.success(data.message || `Server reconnected successfully`);
    } catch (err: any) {
      console.error("Failed to reconnect MCP server:", err);
      toast.error(err.response?.data?.error || "Failed to reconnect server");
    } finally {
      setIsMcpActionLoading(null);
    }
  };

  // Personalization State
  const [isPersonalizationLoading, setIsPersonalizationLoading] =
    useState(false);
  const [isSavingPersonalization, setIsSavingPersonalization] = useState(false);
  const [personalizationData, setPersonalizationData] = useState({
    nickname: "",
    occupation: "",
    tone: "Default",
    customInstructions: "",
  });

  // Memory State
  const [memories, setMemories] = useState<any[]>([]);
  const [isMemoryLoading, setIsMemoryLoading] = useState(true);
  const [isMoreMemoryLoading, setIsMoreMemoryLoading] = useState(false);
  const [hasMoreMemory, setHasMoreMemory] = useState(true);
  const memorySkipRef = React.useRef(0);

  // Local Archive State
  const [localArchivedChats, setLocalArchivedChats] = useState<any[]>([]);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);

  // Local Sharing State
  const [sharedChats, setSharedChats] = useState<any[]>([]);
  const [createdGroups, setCreatedGroups] = useState<any[]>([]);
  const [isSharingLoading, setIsSharingLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);


  // Export State
  const [exportSummary, setExportSummary] = useState("");
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Bulk Delete and Confirmation State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const [deleteType, setDeleteType] = useState<"archive" | "share" | "group" | "memory" | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);




  // Fetch Personalization
  const fetchPersonalization = useCallback(async () => {
    if (!user) return;
    setIsPersonalizationLoading(true);
    try {
      const { data: userData } = await api.get("/user/profile");
      if (userData.personalization) {
        setPersonalizationData({
          nickname: userData.personalization.nickname || "",
          occupation: userData.personalization.occupation || "",
          tone: userData.personalization.tone || "Default",
          customInstructions: userData.personalization.customInstructions || "",
        });
      }
    } catch (error) {
      console.error("Fetch Error:", error);
      toast.error("Failed to load your preferences");
    } finally {
      setIsPersonalizationLoading(false);
    }
  }, [user]);

  // Fetch Memories
  const fetchMemories = useCallback(
    async (isInitial = true) => {
      if (!user) return;

      if (isInitial) {
        setIsMemoryLoading(true);
        memorySkipRef.current = 0;
      } else {
        setIsMoreMemoryLoading(true);
      }

      try {
        const currentSkip = isInitial ? 0 : memorySkipRef.current + LIMIT;
        const { data } = await api.get("/memory", {
          params: { limit: LIMIT, skip: currentSkip },
        });

        if (isInitial) {
          setMemories(data);
        } else {
          setMemories((prev) => [...prev, ...data]);
        }

        setHasMoreMemory(data.length === LIMIT);
        memorySkipRef.current = currentSkip;
      } catch (error) {
        console.error("Memory Fetch Error:", error);
        toast.error("Failed to sync neural bank");
      } finally {
        setIsMemoryLoading(false);
        setIsMoreMemoryLoading(false);
      }
    },
    [user]
  );

  // Fetch Archived Chats Independently
  const fetchArchivedChats = useCallback(async () => {
    if (!user) return;
    setIsArchiveLoading(true);
    try {
      const { data } = await api.get("/chat", {
        params: { isArchived: true, page: 1, limit: 50 },
      });
      setLocalArchivedChats(data);
    } catch (error) {
      console.error("Archive Fetch Error:", error);
      toast.error("Failed to load archive vault");
    } finally {
      setIsArchiveLoading(false);
    }
  }, [user]);

  const handleUnarchive = async (chatId: string) => {
    try {
      await globalUnarchiveChat(chatId);
      setLocalArchivedChats((prev) => prev.filter((c) => c._id !== chatId));
    } catch (error) {
      console.error("Unarchive Error:", error);
    }
  };


  const openArchivedChat = (chat: any) => {
    setIsNewChat(false);
    setCurrentChat(chat._id, chat);
    setMessages([]);
    setSidebarOpen(false);
    navigate(`/chat/${chat._id}`);
    onClose();
  };

  // Fetch Sharing details
  const fetchSharingData = useCallback(async () => {
    if (!user) return;
    setIsSharingLoading(true);
    try {
      const [sharesRes, groupsRes] = await Promise.all([
        api.get("/shared-chat/user/shares"),
        api.get("/group/user-created", { params: { userId: user.id } }),
      ]);
      setSharedChats(sharesRes.data);
      setCreatedGroups(groupsRes.data);
    } catch (error) {
      console.error("Sharing Fetch Error:", error);
      toast.error("Failed to load sharing details");
    } finally {
      setIsSharingLoading(false);
    }
  }, [user]);

  const promptDeleteArchive = (chatIds: string[]) => {
    setItemsToDelete(chatIds);
    setDeleteType("archive");
    setDeleteModalOpen(true);
  };

  const promptDeleteShare = (shareIds: string[]) => {
    setItemsToDelete(shareIds);
    setDeleteType("share");
    setDeleteModalOpen(true);
  };

  const promptDeleteGroup = (groupIds: string[]) => {
    setItemsToDelete(groupIds);
    setDeleteType("group");
    setDeleteModalOpen(true);
  };

  const promptDeleteMemory = (memoryIds: string[]) => {
    setItemsToDelete(memoryIds);
    setDeleteType("memory");
    setDeleteModalOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };


  const handleConfirmDelete = async () => {
    setDeleteModalOpen(false);
    if (itemsToDelete.length === 0 || !deleteType) return;

    const ids = [...itemsToDelete];
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    setItemsToDelete([]);

    if (deleteType === "archive") {
      try {
        await Promise.all(ids.map(id => globalDeleteChat(id)));
        setLocalArchivedChats((prev) => prev.filter((c) => !ids.includes(c._id)));
        toast.success(ids.length > 1 ? "Archived chats deleted" : "Archived chat deleted");
      } catch (error) {
        console.error("Bulk Delete Archive Error:", error);
        toast.error("Failed to delete some archived chats");
      }
    } else if (deleteType === "share") {
      try {
        await Promise.all(ids.map(id => api.delete(`/shared-chat/${id}`)));
        setSharedChats((prev) => prev.filter((c) => !ids.includes(c._id)));
        toast.success(ids.length > 1 ? "Shared chat links deleted" : "Shared chat link deleted");
      } catch (error) {
        console.error("Bulk Delete Shared Chats Error:", error);
        toast.error("Failed to delete some shared chat links");
      }
    } else if (deleteType === "group") {
      try {
        await Promise.all(ids.map(id => api.delete(`/group/${id}`, { data: { userId: user?.id } })));
        setCreatedGroups((prev) => prev.filter((g) => !ids.includes(g._id)));
        ids.forEach(id => removeGroup(id));
        toast.success(ids.length > 1 ? "Group chats deleted" : "Group chat deleted");
        if (ids.includes(currentGroupId || "")) {
          setCurrentGroup(null);
          navigate("/chat");
        }
      } catch (error) {
        console.error("Bulk Delete Groups Error:", error);
        toast.error("Failed to delete some group chats");
      }
    } else if (deleteType === "memory") {
      try {
        await Promise.all(ids.map(id => api.delete(`/memory/${id}`)));
        setMemories((prev) => prev.filter((m) => !ids.includes(m._id)));
        toast.success(ids.length > 1 ? "Memory fragments purged" : "Memory fragment purged");
      } catch (error) {
        console.error("Bulk Purge Memories Error:", error);
        toast.error("Failed to purge some memory fragments");
      }
    }
    setDeleteType(null);
    setIsEditMode(false);
  };



  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied to clipboard");
  };


  useEffect(() => {
    if (isOpen) {
      fetchPersonalization();
      if (activeTab === "memory") fetchMemories(true);
      if (activeTab === "archive") fetchArchivedChats();
      if (activeTab === "sharing" || activeTab === "groups") fetchSharingData();
      if (activeTab === "mcp") fetchMcpServers();
    }
  }, [
    isOpen,
    activeTab,
    fetchPersonalization,
    fetchMemories,
    fetchArchivedChats,
    fetchSharingData,
    fetchMcpServers,
  ]);

  useEffect(() => {
    setSelectedIds([]);
    setIsEditMode(false);
  }, [activeTab, isOpen]);




  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      const root = document.querySelector(".min-h-screen");
      if (root) root.setAttribute("inert", "");
    } else {
      const root = document.querySelector(".min-h-screen");
      if (root) root.removeAttribute("inert");
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const root = document.querySelector(".min-h-screen");
      if (root) root.removeAttribute("inert");
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSavePersonalization = async () => {
    if (!user) return;
    setIsSavingPersonalization(true);
    try {
      await api.put("/user/personalization", personalizationData);
      toast.success("Identity updated successfully");
    } catch (error) {
      console.error("Save Error:", error);
      toast.error("Failed to update preferences");
    } finally {
      setIsSavingPersonalization(false);
    }
  };



  const navItems = [
    { id: "general", label: "General", icon: Settings },
    { id: "personalization", label: "Personalization", icon: Sparkles },
    { id: "memory", label: "Memory", icon: Brain },
    { id: "mcp", label: "Plugins & Apps", icon: Zap },
    { id: "archive", label: "Archive", icon: Archive },
    { id: "sharing", label: "Shared Chats", icon: Share },
    { id: "groups", label: "My Groups", icon: Users },
    { id: "data", label: "Data Control", icon: FileText },
    { id: "security", label: "Security", icon: Shield },
  ];



  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 lg:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 not-selectable "
      onMouseDown={(e) => setMouseDownOnBackdrop(e.target === e.currentTarget)}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop && e.target === e.currentTarget) onClose();
        setMouseDownOnBackdrop(false);
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-full lg:h-[600px] max-h-[100vh] lg:max-h-[85vh] bg-slate-950 border lg:border-white/10 rounded-none lg:rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row animate-in zoom-in-95 duration-300 relative"
      >
        {/* Internal Sidebar */}
        <div className={`w-full lg:w-64 bg-slate-900/50 border-b lg:border-b-0 lg:border-r border-white/5 p-4 flex-col shrink-0 ${mobileView === "list" ? "flex" : "hidden lg:flex"}`}>
          <div className="mb-6 lg:mb-8 px-2 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Settings</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">
                Velora Intelligence
              </p>
            </div>
            {/* Mobile close button on list view */}
            <button
              onClick={onClose}
              className="lg:hidden p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex flex-col space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest transition-all ${
                  activeTab === item.id
                    ? "bg-white text-black shadow-lg"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Mobile Navigation List (Like ChatGPT Mobile) */}
          <div className="lg:hidden flex-1 overflow-y-auto space-y-2 py-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileView("detail");
                }}
                className="flex w-full items-center justify-between rounded-2xl bg-white/2 border border-white/5 px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5">
                  <item.icon size={18} className="text-slate-400" />
                  <span>{item.label}</span>
                </div>
                <ArrowLeft size={16} className="rotate-180 text-slate-500" />
              </button>
            ))}
          </div>

          {/* Desktop SignOut */}
          <div className="hidden lg:block mt-auto pt-4 border-t border-white/5">
             <SignOutButton>
                <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest text-rose-500 hover:bg-rose-500/5 transition-all">
                  <LogOut size={16} />
                  <span>Log Out</span>
                </button>
             </SignOutButton>
          </div>

          {/* Mobile SignOut */}
          <div className="lg:hidden mt-auto pt-4 border-t border-white/5">
             <SignOutButton>
                <button className="flex w-full items-center justify-between rounded-2xl bg-rose-500/5 border border-rose-500/10 px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 transition-all">
                  <div className="flex items-center gap-3.5">
                    <LogOut size={18} />
                    <span>Log Out</span>
                  </div>
                  <ArrowLeft size={16} className="rotate-180" />
                </button>
             </SignOutButton>
          </div>
        </div>

        {/* Content Area */}
        <div className={`flex-1 flex flex-col min-w-0 bg-slate-950 ${mobileView === "detail" ? "flex" : "hidden lg:flex"}`}>
          {/* Header (Mobile Close) */}
          <div className="flex items-center justify-between px-4 lg:px-8 py-4 lg:py-6 border-b border-white/5 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileView("list")}
                className="lg:hidden p-2 hover:bg-white/5 rounded-xl transition-all text-slate-400 hover:text-white shrink-0 animate-in slide-in-from-left-2 duration-200"
              >
                <ArrowLeft size={18} />
              </button>
              <h3 className="text-xs lg:text-sm font-bold uppercase tracking-[0.2em] text-white truncate">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-white shrink-0"
            >
              <X size={18} className="lg:w-5 lg:h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
            {activeTab === "general" && !isEditingProfile && (
              <div className="space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 lg:p-6 rounded-3xl bg-white/3 border border-white/5 overflow-hidden group gap-4">
                  <div className="flex items-center gap-4 lg:gap-6">
                    <div className="h-16 w-16 lg:h-20 lg:w-20 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl shrink-0">
                      <img src={dbUser?.imageUrl || user?.imageUrl} alt={dbUser?.firstName ? `${dbUser.firstName} ${dbUser.lastName || ""}` : (user?.fullName || "")} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base lg:text-xl font-bold text-white truncate">{dbUser?.firstName ? `${dbUser.firstName} ${dbUser.lastName || ""}` : user?.fullName}</h4>
                      <p className="text-xs lg:text-sm text-slate-500 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                         <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest border border-emerald-500/20">Premium</span>
                          {/* eslint-disable-next-line react-hooks/purity */}
                          <span className="text-slate-700 text-[10px] font-medium">• Member since {new Date(user?.createdAt || Date.now()).getFullYear()}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsEditingProfile(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 text-[9px] font-bold uppercase tracking-widest transition-all shrink-0 self-start sm:self-center"
                  >
                    <Pencil size={12} />
                    <span>Edit Profile</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="p-4 lg:p-5 rounded-3xl border border-white/5 bg-white/2 hover:bg-white/5 transition-colors cursor-pointer group">
                      <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                        <User size={20} />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Identity</p>
                      <p className="text-sm font-medium text-white">{personalizationData.nickname || user?.firstName || "User"}</p>
                   </div>
                   <div className="p-4 lg:p-5 rounded-3xl border border-white/5 bg-white/2 hover:bg-white/5 transition-colors cursor-pointer group">
                      <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                        <Briefcase size={20} />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Occupation</p>
                      <p className="text-sm font-medium text-white">{personalizationData.occupation || "Not Set"}</p>
                   </div>
                </div>
              </div>
            )}

            {activeTab === "general" && isEditingProfile && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col items-center justify-center p-4 lg:p-6 rounded-3xl bg-white/3 border border-white/5 gap-4 relative">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageChange}
                    accept="image/*"
                    className="hidden"
                  />

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="h-20 w-20 lg:h-24 lg:w-24 rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl relative cursor-pointer group/avatar"
                  >
                    <img
                      src={previewUrl || user?.imageUrl}
                      alt="Avatar Preview"
                      className="w-full h-full object-cover group-hover/avatar:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <Camera size={16} className="text-white" />
                      <span className="text-[8px] font-bold text-white uppercase tracking-wider">Upload</span>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avatar Image</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">Click to choose a new picture</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">First Name</label>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      placeholder="First Name"
                      className="w-full bg-white/3 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Last Name</label>
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      placeholder="Last Name"
                      className="w-full bg-white/3 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    disabled={isSavingProfile}
                    className="w-full sm:flex-1 py-3 lg:py-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile || !editFirstName.trim()}
                    className="w-full sm:flex-1 flex items-center justify-center gap-2 bg-white text-black py-3 lg:py-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                  >
                    {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{isSavingProfile ? "Saving..." : "Save Changes"}</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === "personalization" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {isPersonalizationLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Synchronizing Identity...</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nickname</label>
                        <input
                          type="text"
                          value={personalizationData.nickname}
                          onChange={(e) => setPersonalizationData({...personalizationData, nickname: e.target.value})}
                          placeholder="What should I call you?"
                          className="w-full bg-white/3 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Occupation</label>
                        <input
                          type="text"
                          value={personalizationData.occupation}
                          onChange={(e) => setPersonalizationData({...personalizationData, occupation: e.target.value})}
                          placeholder="e.g. Developer"
                          className="w-full bg-white/3 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Response Tone</label>
                      <div className="flex flex-wrap gap-1.5 lg:gap-2">
                        {TONE_OPTIONS.map((tone) => (
                          <button
                            key={tone}
                            onClick={() => setPersonalizationData({...personalizationData, tone})}
                            className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl text-[9px] lg:text-[10px] font-bold uppercase tracking-widest transition-all border ${
                              personalizationData.tone === tone
                                ? "bg-white text-black border-white"
                                : "bg-white/3 border-white/5 text-slate-500 hover:text-white"
                            }`}
                          >
                            {tone}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Instructions</label>
                      <textarea
                        rows={3}
                        value={personalizationData.customInstructions}
                        onChange={(e) => setPersonalizationData({...personalizationData, customInstructions: e.target.value})}
                        placeholder="How should Velora respond to you?"
                        className="w-full bg-white/3 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10 transition-all resize-none lg:rows-4"
                      />
                    </div>

                    <button
                      onClick={handleSavePersonalization}
                      disabled={isSavingPersonalization}
                      className="w-full flex items-center justify-center gap-2 bg-white text-black py-3 lg:py-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                    >
                      {isSavingPersonalization ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      <span>Save Identity</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {activeTab === "memory" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 mb-4 gap-4">
                   <div className="flex items-center gap-3">
                      <Brain className="text-emerald-400 shrink-0" size={20} />
                      <div>
                        <p className="text-[11px] font-bold text-white uppercase tracking-widest">Neural Bank</p>
                        <p className="text-[10px] text-emerald-400/60 font-medium">Auto-sync active</p>
                      </div>
                   </div>
                   <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                     <div className="text-left sm:text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{memories.length} / 100</p>
                        <div className="h-1 w-24 bg-white/5 rounded-full mt-1 overflow-hidden">
                           <div className="h-full bg-emerald-500" style={{width: `${Math.min(memories.length, 100)}%`}} />
                        </div>
                     </div>
                     {memories.length > 0 && (
                        <button
                          onClick={() => {
                            setIsEditMode(prev => !prev);
                            setSelectedIds([]);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                            isEditMode 
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30" 
                              : "bg-white/5 text-slate-400 border border-white/5 hover:text-white hover:bg-white/10"
                          }`}
                        >
                          {isEditMode ? "Cancel" : "Edit"}
                        </button>
                     )}
                   </div>
                </div>

                {isMemoryLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Accessing Core fragments...</p>
                  </div>
                ) : memories.length === 0 ? (
                  <div className="text-center py-20 bg-white/2 border border-dashed border-white/5 rounded-3xl">
                    <Brain className="w-10 h-10 text-slate-800 mx-auto mb-4 opacity-50" />
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">No memory fragments found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {isEditMode && (
                      <div className="flex flex-wrap items-center justify-between p-3 rounded-2xl bg-white/2 border border-white/5 mb-3 animate-in fade-in slide-in-from-top-1 duration-200 gap-2">
                        <button
                          onClick={() => {
                            const allIds = memories.map(m => m._id);
                            const allSelected = allIds.every(id => selectedIds.includes(id));
                            if (allSelected) {
                              setSelectedIds([]);
                            } else {
                              setSelectedIds(allIds);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/5 transition-all text-[9px] font-bold uppercase tracking-widest"
                        >
                          {memories.every(m => selectedIds.includes(m._id)) ? "Deselect All" : "Select All"}
                        </button>
                        
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {selectedIds.length} Selected
                        </span>

                        <button
                          disabled={selectedIds.length === 0}
                          onClick={() => promptDeleteMemory(selectedIds)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-[9px] font-bold uppercase tracking-widest ${
                            selectedIds.length > 0
                              ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white"
                              : "bg-white/2 border-white/5 text-slate-600 cursor-not-allowed"
                          }`}
                        >
                          <Trash2 size={12} />
                          Delete Selected
                        </button>
                      </div>
                    )}

                    {memories.map((memory) => {
                      const isSelected = selectedIds.includes(memory._id);
                      return (
                        <div 
                          key={memory._id}
                          onClick={() => isEditMode && toggleSelect(memory._id)}
                          className={`group flex items-start gap-4 p-4 rounded-2xl border transition-all ${
                            isEditMode ? "cursor-pointer" : ""
                          } ${
                            isSelected 
                              ? "bg-emerald-500/5 border-emerald-500/20" 
                              : "bg-white/2 border-white/5 hover:border-white/10"
                          }`}
                        >
                          {isEditMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(memory._id);
                              }}
                              className={`flex-shrink-0 w-4 h-4 rounded-md border flex items-center justify-center mt-1 transition-all ${
                                isSelected 
                                  ? "bg-emerald-500 border-emerald-400 text-slate-950" 
                                  : "border-white/20 hover:border-emerald-500/50"
                              }`}
                            >
                              {isSelected && <Check size={10} strokeWidth={4} />}
                            </button>
                          )}
                          <div className="mt-1 text-slate-600 group-hover:text-emerald-400 transition-colors">
                            <Zap size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                             <p className="text-[13px] text-slate-300 leading-relaxed">{memory.content}</p>
                             <div className="flex items-center gap-2 mt-2">
                                <span className="text-[9px] font-bold upabortControllerRefpercase tracking-widest text-slate-600">{memory.category}</span>
                                <span className="text-[9px] text-slate-700">• {new Date(memory.createdAt).toLocaleDateString()}</span>
                             </div>
                          </div>
                          {!isEditMode && (
                            <button 
                              onClick={() => promptDeleteMemory([memory._id])} 
                              className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-rose-500 transition-all cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {hasMoreMemory && (
                       <button 
                        onClick={() => fetchMemories(false)}
                        disabled={isMoreMemoryLoading}
                        className="w-full py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                       >
                         {isMoreMemoryLoading ? "Loading..." : "Load More"}
                       </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {activeTab === "archive" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                   <div className="flex items-center gap-3">
                      <Archive className="text-amber-400 shrink-0" size={20} />
                      <div>
                        <p className="text-[11px] font-bold text-white uppercase tracking-widest">Archive Vault</p>
                        <p className="text-[10px] text-amber-400/60 font-medium">{localArchivedChats.length} Conversations preserved</p>
                      </div>
                   </div>
                   {localArchivedChats.length > 0 && (
                      <button
                        onClick={() => {
                          setIsEditMode(prev => !prev);
                          setSelectedIds([]);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                          isEditMode 
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30" 
                            : "bg-white/5 text-slate-400 border border-white/5 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {isEditMode ? "Cancel" : "Edit"}
                      </button>
                   )}
                </div>

                {isArchiveLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Opening Vault...</p>
                  </div>
                ) : localArchivedChats.length === 0 ? (
                  <div className="text-center py-20 bg-white/2 border border-dashed border-white/5 rounded-3xl">
                    <History className="w-10 h-10 text-slate-800 mx-auto mb-4 opacity-50" />
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">The vault is empty</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {isEditMode && (
                      <div className="flex flex-wrap items-center justify-between p-3 rounded-2xl bg-white/2 border border-white/5 mb-3 animate-in fade-in slide-in-from-top-1 duration-200 gap-2">
                        <button
                          onClick={() => {
                            const allIds = localArchivedChats.map(c => c._id);
                            const allSelected = allIds.every(id => selectedIds.includes(id));
                            if (allSelected) {
                              setSelectedIds([]);
                            } else {
                              setSelectedIds(allIds);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/5 transition-all text-[9px] font-bold uppercase tracking-widest"
                        >
                          {localArchivedChats.every(c => selectedIds.includes(c._id)) ? "Deselect All" : "Select All"}
                        </button>
                        
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {selectedIds.length} Selected
                        </span>

                        <button
                          disabled={selectedIds.length === 0}
                          onClick={() => promptDeleteArchive(selectedIds)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-[9px] font-bold uppercase tracking-widest ${
                            selectedIds.length > 0
                              ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white"
                              : "bg-white/2 border-white/5 text-slate-600 cursor-not-allowed"
                          }`}
                        >
                          <Trash2 size={12} />
                          Delete Selected
                        </button>
                      </div>
                    )}

                    {localArchivedChats.map((chat) => {
                      const isSelected = selectedIds.includes(chat._id);
                      return (
                        <div 
                          key={chat._id} 
                          onClick={() => {
                            if (isEditMode) {
                              toggleSelect(chat._id);
                            } else {
                              openArchivedChat(chat);
                            }
                          }}
                          className={`group flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                            isSelected 
                              ? "bg-white/5 border-amber-500/30" 
                              : "bg-white/2 border-white/5 hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                             {isEditMode && (
                               <div 
                                 className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                                   isSelected 
                                     ? "bg-amber-500 border-amber-500 text-white" 
                                     : "border-white/10 bg-white/5 hover:border-white/20"
                                 }`}
                               >
                                 {isSelected && <Check size={12} className="stroke-[3]" />}
                               </div>
                             )}
                             <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 group-hover:text-amber-400 transition-colors shrink-0">
                                <MessageSquare size={18} />
                             </div>
                             <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-white truncate">{chat.title || "Untitled Session"}</p>
                                <p className="text-[10px] text-slate-600 font-medium">Last active {new Date(chat.updatedAt).toLocaleDateString()}</p>
                             </div>
                          </div>
                          
                          {!isEditMode && (
                            <div className="flex items-center gap-2 shrink-0">
                               <button 
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleUnarchive(chat._id);
                                }}
                                className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
                               >
                                 <ArrowLeft size={14} />
                                 <span className="hidden sm:inline">Restore</span>
                               </button>
                               <button 
                                onClick={(event) => {
                                  event.stopPropagation();
                                  promptDeleteArchive([chat._id]);
                                }}
                                className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                               >
                                 <Trash2 size={14} />
                               </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}


            {activeTab === "sharing" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                   <div className="flex items-center gap-3">
                      <Share className="text-indigo-400 shrink-0" size={20} />
                      <div>
                        <p className="text-[11px] font-bold text-white uppercase tracking-widest">Shared Chats</p>
                        <p className="text-[10px] text-indigo-400/60 font-medium">Manage your publicly shared conversation links</p>
                      </div>
                   </div>
                   {sharedChats.length > 0 && (
                      <button
                        onClick={() => {
                          setIsEditMode(prev => !prev);
                          setSelectedIds([]);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                          isEditMode 
                            ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30" 
                            : "bg-white/5 text-slate-400 border border-white/5 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {isEditMode ? "Cancel" : "Edit"}
                      </button>
                   )}
                </div>

                {isSharingLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Synchronizing resources...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <MessageSquare size={14} className="text-indigo-400" />
                        Shared Conversations ({sharedChats.length})
                      </h3>
                      
                      {sharedChats.length === 0 ? (
                        <div className="p-8 text-center bg-white/2 border border-dashed border-white/5 rounded-2xl">
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">No shared chats yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {isEditMode && (
                            <div className="flex flex-wrap items-center justify-between p-3 rounded-2xl bg-white/2 border border-white/5 mb-3 animate-in fade-in slide-in-from-top-1 duration-200 gap-2">
                              <button
                                onClick={() => {
                                  const allIds = sharedChats.map(c => c._id);
                                  const allSelected = allIds.every(id => selectedIds.includes(id));
                                  if (allSelected) {
                                    setSelectedIds([]);
                                  } else {
                                    setSelectedIds(allIds);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/5 transition-all text-[9px] font-bold uppercase tracking-widest"
                              >
                                {sharedChats.every(c => selectedIds.includes(c._id)) ? "Deselect All" : "Select All"}
                              </button>
                              
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {selectedIds.length} Selected
                              </span>

                              <button
                                disabled={selectedIds.length === 0}
                                onClick={() => promptDeleteShare(selectedIds)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-[9px] font-bold uppercase tracking-widest ${
                                  selectedIds.length > 0
                                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white"
                                    : "bg-white/2 border-white/5 text-slate-600 cursor-not-allowed"
                                }`}
                              >
                                <Trash2 size={12} />
                                Delete Selected
                              </button>
                            </div>
                          )}

                          {sharedChats.map((share) => {
                            const shareUrl = `${window.location.origin}/shared/${share._id}`;
                            const isShareCopied = copiedId === share._id;
                            const isSelected = selectedIds.includes(share._id);
                            return (
                              <div 
                                key={share._id} 
                                onClick={() => {
                                  if (isEditMode) {
                                    toggleSelect(share._id);
                                  }
                                }}
                                className={`group flex items-center justify-between p-4 rounded-2xl border transition-all ${
                                  isEditMode ? "cursor-pointer" : ""
                                } ${
                                  isSelected 
                                    ? "bg-white/5 border-indigo-500/30" 
                                    : "bg-white/2 border-white/5 hover:bg-white/5"
                                }`}
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                                  {isEditMode && (
                                    <div 
                                      className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                                        isSelected 
                                          ? "bg-indigo-500 border-indigo-500 text-white" 
                                          : "border-white/10 bg-white/5 hover:border-white/20"
                                      }`}
                                    >
                                      {isSelected && <Check size={12} className="stroke-[3]" />}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white truncate">{share.title || "Shared Chat Session"}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[9px] text-slate-500 font-medium">Shared {new Date(share.createdAt).toLocaleDateString()}</span>
                                      <span className="text-[9px] text-slate-600 truncate max-w-[200px]">{shareUrl}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                {!isEditMode && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                      onClick={() => handleCopy(shareUrl, share._id)}
                                      className={`p-2.5 rounded-xl transition-all border flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${
                                        isShareCopied 
                                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                          : "bg-white/5 border-transparent text-slate-400 hover:text-white hover:bg-white/10"
                                      }`}
                                      title="Copy Share Link"
                                    >
                                      {isShareCopied ? <Check size={12} /> : <Copy size={12} />}
                                      <span className="hidden sm:inline">{isShareCopied ? "Copied" : "Copy Link"}</span>
                                    </button>
                                    <button 
                                      onClick={() => promptDeleteShare([share._id])}
                                      className="p-2.5 rounded-xl bg-white/5 border border-transparent text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all"
                                      title="Revoke / Delete share link"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "groups" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                   <div className="flex items-center gap-3">
                      <Users className="text-indigo-400 shrink-0" size={20} />
                      <div>
                        <p className="text-[11px] font-bold text-white uppercase tracking-widest">My Groups</p>
                        <p className="text-[10px] text-indigo-400/60 font-medium">Manage and delete collaborative groups you created</p>
                      </div>
                   </div>
                   {createdGroups.length > 0 && (
                      <button
                        onClick={() => {
                          setIsEditMode(prev => !prev);
                          setSelectedIds([]);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                          isEditMode 
                            ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30" 
                            : "bg-white/5 text-slate-400 border border-white/5 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {isEditMode ? "Cancel" : "Edit"}
                      </button>
                   )}
                </div>

                {isSharingLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Synchronizing resources...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <Users size={14} className="text-indigo-400" />
                        Created Groups ({createdGroups.length})
                      </h3>

                      {createdGroups.length === 0 ? (
                        <div className="p-8 text-center bg-white/2 border border-dashed border-white/5 rounded-2xl">
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">No created groups yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {isEditMode && (
                            <div className="flex flex-wrap items-center justify-between p-3 rounded-2xl bg-white/2 border border-white/5 mb-3 animate-in fade-in slide-in-from-top-1 duration-200 gap-2">
                              <button
                                onClick={() => {
                                  const allIds = createdGroups.map(c => c._id);
                                  const allSelected = allIds.every(id => selectedIds.includes(id));
                                  if (allSelected) {
                                    setSelectedIds([]);
                                  } else {
                                    setSelectedIds(allIds);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/5 transition-all text-[9px] font-bold uppercase tracking-widest"
                              >
                                {createdGroups.every(c => selectedIds.includes(c._id)) ? "Deselect All" : "Select All"}
                              </button>
                              
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {selectedIds.length} Selected
                              </span>

                              <button
                                disabled={selectedIds.length === 0}
                                onClick={() => promptDeleteGroup(selectedIds)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-[9px] font-bold uppercase tracking-widest ${
                                  selectedIds.length > 0
                                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white"
                                    : "bg-white/2 border-white/5 text-slate-600 cursor-not-allowed"
                                }`}
                              >
                                <Trash2 size={12} />
                                Delete Selected
                              </button>
                            </div>
                          )}

                          {createdGroups.map((group) => {
                            const inviteUrl = `${window.location.origin}/join/${group.inviteCode}`;
                            const isInviteCopied = copiedId === group._id;
                            const isSelected = selectedIds.includes(group._id);
                            return (
                              <div 
                                key={group._id} 
                                onClick={() => {
                                  if (isEditMode) {
                                    toggleSelect(group._id);
                                  }
                                }}
                                className={`group flex items-center justify-between p-4 rounded-2xl border transition-all ${
                                  isEditMode ? "cursor-pointer" : ""
                                } ${
                                  isSelected 
                                    ? "bg-white/5 border-indigo-500/30" 
                                    : "bg-white/2 border-white/5 hover:bg-white/5"
                                }`}
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                                  {isEditMode && (
                                    <div 
                                      className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                                        isSelected 
                                          ? "bg-indigo-500 border-indigo-500 text-white" 
                                          : "border-white/10 bg-white/5 hover:border-white/20"
                                      }`}
                                    >
                                      {isSelected && <Check size={12} className="stroke-[3]" />}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white truncate">{group.title || "Collaborative Group"}</p>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                      <span className="text-[9px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-md">Creator</span>
                                      <span className="text-[9px] text-slate-500 font-medium">{group.members?.length || 1} Members</span>
                                      <span className="text-[9px] text-slate-600 font-medium">Code: {group.inviteCode}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                {!isEditMode && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button 
                                      onClick={() => handleCopy(inviteUrl, group._id)}
                                      className={`p-2.5 rounded-xl transition-all border flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${
                                        isInviteCopied 
                                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                          : "bg-white/5 border-transparent text-slate-400 hover:text-white hover:bg-white/10"
                                      }`}
                                      title="Copy Invite Link"
                                    >
                                      {isInviteCopied ? <Check size={12} /> : <Copy size={12} />}
                                      <span className="hidden sm:inline">{isInviteCopied ? "Copied" : "Copy Invite"}</span>
                                    </button>
                                    <button 
                                      onClick={() => promptDeleteGroup([group._id])}
                                      className="p-2.5 rounded-xl bg-white/5 border border-transparent text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all"
                                      title="Delete group (Removes all members)"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}


            {activeTab === "data" && (

              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-4 lg:p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 mb-4">
                  <div className="flex items-center gap-3 lg:gap-4 mb-3 lg:mb-4">
                    <div className="h-10 w-10 lg:h-12 lg:w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                      <FileText size={20} className="lg:w-6 lg:h-6" />
                    </div>
                    <div>
                      <h4 className="text-base lg:text-lg font-bold text-white">AI Identity Portability</h4>
                      <p className="text-[9px] lg:text-[10px] text-blue-400/60 font-bold uppercase tracking-widest">Context Export System</p>
                    </div>
                  </div>
                  <p className="text-xs lg:text-sm text-slate-400 leading-relaxed">
                    Generate a comprehensive summary of everything Velora has learned about you. 
                    This export is designed to help you "port" your context to other AI assistants, 
                    preserving your instructions, preferences, and key life events.
                  </p>
                </div>

                {!exportSummary ? (
                  <div className="space-y-3">
                    <button
                      onClick={async () => {
                        if (!user) return;
                        setIsExportLoading(true);
                        
                        // Setup AbortController
                        const controller = new AbortController();
                        abortControllerRef.current = controller;

                        try {
                          const { data } = await api.get("/user/export", {
                            signal: controller.signal,
                          });
                          setExportSummary(data.summary);
                          toast.success("Identity summary generated");
                        } catch (error: any) {
                          if (error.name === 'AbortError') {
                            toast.info("Generation cancelled");
                          } else {
                            console.error("Export Error:", error);
                            toast.error("Failed to generate export");
                          }
                        } finally {
                          setIsExportLoading(false);
                          abortControllerRef.current = null;
                        }
                      }}
                      disabled={isExportLoading}
                      className="w-full flex items-center justify-center gap-3 bg-white text-black py-5 rounded-3xl text-[12px] font-bold uppercase tracking-[0.2em] hover:bg-slate-200 transition-all disabled:opacity-50"
                    >
                      {isExportLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                      <span>{isExportLoading ? "Processing Neural Data..." : "Generate Identity Summary"}</span>
                    </button>

                    {isExportLoading && (
                      <button
                        onClick={() => {
                          if (abortControllerRef.current) {
                            abortControllerRef.current.abort();
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:bg-rose-500/5 transition-all border border-rose-500/10"
                      >
                        <XCircle size={14} />
                        <span>Cancel Generation</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative group">
                      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-10">
                         <button 
                          onClick={() => {
                            navigator.clipboard.writeText(exportSummary);
                            setIsCopied(true);
                            setTimeout(() => setIsCopied(false), 2000);
                            toast.success("Copied to clipboard");
                          }}
                          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md"
                         >
                            {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                         </button>
                         <button 
                          onClick={() => {
                            const blob = new Blob([exportSummary], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `velora-identity-export-${new Date().toISOString().split('T')[0]}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md"
                         >
                            <Download size={14} />
                         </button>
                      </div>
                      <pre className="w-full h-[300px] lg:h-[350px] overflow-y-auto bg-black/40 border border-white/5 rounded-2xl lg:rounded-3xl p-4 lg:p-8 text-[11px] lg:text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap selection:bg-white/10">
                        {exportSummary}
                      </pre>
                    </div>
                    <button 
                      onClick={() => setExportSummary("")}
                      className="w-full py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-white transition-colors"
                    >
                      Clear and Regenerate
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-4">
                  <h4 className="text-[10px] lg:text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Security Controls</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 lg:p-5 rounded-2xl lg:rounded-3xl bg-white/3 border border-white/5">
                      <div>
                        <p className="text-xs lg:text-sm font-bold text-white">Encryption</p>
                        <p className="text-[9px] lg:text-[10px] text-slate-500 font-medium">All neural data is end-to-end encrypted</p>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="flex items-center justify-between p-4 lg:p-5 rounded-2xl lg:rounded-3xl bg-white/3 border border-white/5">
                      <div>
                        <p className="text-xs lg:text-sm font-bold text-white">Data Privacy</p>
                        <p className="text-[9px] lg:text-[10px] text-slate-500 font-medium">Manage how your data is used for training</p>
                      </div>
                      <button className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors">Manage</button>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                   <p className="text-[10px] font-bold text-rose-500/60 uppercase tracking-[0.2em] mb-4">Danger Zone</p>
                   <button className="flex items-center gap-3 w-full p-4 lg:p-5 rounded-2xl lg:rounded-3xl border border-rose-500/20 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-all text-left">
                      <Trash2 size={20} className="shrink-0" />
                      <div>
                        <p className="text-sm font-bold">Delete Account</p>
                        <p className="text-[10px] opacity-60 font-medium">Permanently wipe all neural and chat history</p>
                      </div>
                   </button>
                </div>
              </div>
            )}

            {activeTab === "mcp" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Header Information Banner */}
                <div className="p-5 rounded-3xl bg-amber-500/5 border border-amber-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap className="text-amber-400 animate-pulse" size={20} />
                    <div>
                      <p className="text-[11px] font-bold text-white uppercase tracking-widest">Plugins & Integrations</p>
                      <p className="text-[10px] text-amber-400/60 font-medium">Extend Velora with real-time web, data, and developer actions</p>
                    </div>
                  </div>
                </div>

                {/* Integrations List Panel */}
                {isMcpLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                    <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">Synchronizing Active Integrations...</p>
                  </div>
                ) : mcpError ? (
                  <div className="text-center py-20 bg-white/2 border border-dashed border-white/5 rounded-3xl space-y-3">
                    <WifiOff className="w-10 h-10 text-slate-800 mx-auto opacity-50 animate-pulse" />
                    <p className="text-rose-400 text-[10px] font-bold uppercase tracking-widest">{mcpError}</p>
                    <button
                      onClick={fetchMcpServers}
                      className="text-[9px] font-bold text-slate-400 hover:text-white uppercase tracking-widest border border-white/5 px-3 py-1.5 rounded-xl hover:bg-white/5"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : mcpServers.length === 0 ? (
                  <div className="text-center py-20 bg-white/2 border border-dashed border-white/5 rounded-3xl">
                    <Zap className="w-10 h-10 text-slate-800 mx-auto mb-4 opacity-50" />
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">No active integrations found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mcpServers.map((server) => {
                      const isConnected = server.enabled && server.connected;
                      
                      // Dynamic Icon Matching
                      let IconComponent = Sliders;
                      const serverNameLower = server.name.toLowerCase();
                      if (serverNameLower.includes("search") || serverNameLower.includes("web")) {
                        IconComponent = Globe;
                      } else if (serverNameLower.includes("sqlite") || serverNameLower.includes("db") || serverNameLower.includes("sql")) {
                        IconComponent = Database;
                      } else if (serverNameLower.includes("github") || serverNameLower.includes("git")) {
                        IconComponent = GitBranch;
                      }

                      return (
                        <div
                          key={server.name}
                          className="group rounded-3xl border transition-all p-5 space-y-4 bg-slate-900/40 border-white/5 hover:border-white/10"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-colors ${
                                isConnected ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-slate-500"
                              }`}>
                                <IconComponent size={20} />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white tracking-wide capitalize">
                                  {server.name.replace(/_|-/g, " ")}
                                </h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    isConnected ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" : (server.enabled ? "bg-amber-400 animate-pulse" : "bg-slate-700")
                                  }`} />
                                  <span className={`text-[9px] font-bold uppercase tracking-widest ${
                                    isConnected ? "text-emerald-400" : (server.enabled ? "text-amber-400/80" : "text-slate-600")
                                  }`}>
                                    {isConnected ? "Connected" : (server.enabled ? "Reconnecting..." : "Disabled")}
                                  </span>
                                  <span className="text-slate-700 text-[9px] font-medium">•</span>
                                  <span className="text-slate-600 text-[9px] font-semibold uppercase tracking-widest font-mono">
                                    {server.type}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Reconnect button */}
                              {server.enabled && (
                                <button
                                  onClick={() => reconnectMcpServer(server.name)}
                                  disabled={isMcpActionLoading === server.name}
                                  className="p-1.5 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20 transition-all flex items-center justify-center cursor-pointer"
                                  title="Force Reconnect / Restart Server"
                                >
                                  <RefreshCw size={14} className={isMcpActionLoading === server.name ? "animate-spin text-amber-400" : ""} />
                                </button>
                              )}

                              {/* Toggle switch */}
                              {isMcpActionLoading === server.name ? (
                                <Loader2 size={16} className="animate-spin text-slate-500 mr-2" />
                              ) : (
                                <button
                                  onClick={() => toggleMcpServer(server.name, server.enabled)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    server.enabled ? "bg-emerald-500" : "bg-slate-800"
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                      server.enabled ? "translate-x-4" : "translate-x-0"
                                    }`}
                                  />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {deleteModalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="w-full max-w-sm p-8 rounded-3xl bg-slate-900/90 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] space-y-6 text-center animate-in zoom-in-95 duration-200">
                <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.15)]">
                  <Trash2 size={22} className="animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-base font-bold text-white tracking-wide">Confirm Action</h4>
                  <p className="text-xs text-slate-400 leading-relaxed px-2">
                    {itemsToDelete.length > 1
                      ? `Are you sure you want to permanently delete these ${itemsToDelete.length} selected items? This action cannot be undone.`
                      : "Are you sure you want to permanently delete this item? This action cannot be undone."}
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setDeleteModalOpen(false);
                      setItemsToDelete([]);
                      setDeleteType(null);
                    }}
                    className="flex-1 py-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:text-white text-slate-300 text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-600 hover:text-white text-rose-400 text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(244,63,94,0.1)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default SettingsModal;
