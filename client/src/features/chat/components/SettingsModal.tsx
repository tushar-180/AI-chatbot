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
} from "lucide-react";
import { useUser, SignOutButton } from "@clerk/react";
import { toast } from "sonner";
import { useChatList } from "@/features/chat/hooks/useChatList";

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
  const {
    deleteChat: globalDeleteChat,
    unarchiveChat: globalUnarchiveChat,
    selectChat,
    upsertChat,
  } = useChatList();
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
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
  const [memorySkip, setMemorySkip] = useState(0);

  // Local Archive State
  const [localArchivedChats, setLocalArchivedChats] = useState<any[]>([]);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);

  // Export State
  const [exportSummary, setExportSummary] = useState("");
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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
        setMemorySkip(0);
      } else {
        setIsMoreMemoryLoading(true);
      }

      try {
        const currentSkip = isInitial ? 0 : memorySkip + LIMIT;
        const { data } = await api.get("/memory", {
          params: { limit: LIMIT, skip: currentSkip },
        });

        if (isInitial) {
          setMemories(data);
        } else {
          setMemories((prev) => [...prev, ...data]);
        }

        setHasMoreMemory(data.length === LIMIT);
        setMemorySkip(currentSkip);
      } catch (error) {
        console.error("Memory Fetch Error:", error);
        toast.error("Failed to sync neural bank");
      } finally {
        setIsMemoryLoading(false);
        setIsMoreMemoryLoading(false);
      }
    },
    [user, memorySkip]
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

  const handleDeleteArchived = async (chatId: string) => {
    try {
      await globalDeleteChat(chatId);
      setLocalArchivedChats((prev) => prev.filter((c) => c._id !== chatId));
    } catch (error) {
      console.error("Delete Error:", error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPersonalization();
      if (activeTab === "memory") fetchMemories(true);
      if (activeTab === "archive") fetchArchivedChats();
    }
  }, [
    isOpen,
    activeTab,
    fetchPersonalization,
    fetchMemories,
    fetchArchivedChats,
  ]);

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

  const deleteMemory = async (id: string) => {
    if (!user) return;
    try {
      await api.delete(`/memory/${id}`);
      setMemories((prev) => prev.filter((m) => m._id !== id));
      toast.success("Memory purged successfully");
    } catch (error: any) {
      if (error?.response?.status === 404) {
        setMemories((prev) => prev.filter((m) => m._id !== id));
        return;
      }
      console.error("Delete Error:", error);
      toast.error("Failed to purge memory fragment");
    }
  };

  const navItems = [
    { id: "general", label: "General", icon: Settings },
    { id: "personalization", label: "Personalization", icon: Sparkles },
    { id: "memory", label: "Memory", icon: Brain },
    { id: "archive", label: "Archive", icon: Archive },
    { id: "data", label: "Data Control", icon: FileText },
    { id: "security", label: "Security", icon: Shield },
  ];

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onMouseDown={(e) => setMouseDownOnBackdrop(e.target === e.currentTarget)}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop && e.target === e.currentTarget) onClose();
        setMouseDownOnBackdrop(false);
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[600px] bg-slate-950 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-300"
      >
        {/* Internal Sidebar */}
        <div className="w-full md:w-64 bg-slate-900/50 border-r border-white/5 p-4 flex flex-col">
          <div className="mb-8 px-2">
            <h2 className="text-lg font-bold text-white">Settings</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1">
              Velora Intelligence
            </p>
          </div>

          <nav className="flex-1 space-y-1">
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

          <div className="mt-auto pt-4 border-t border-white/5">
             <SignOutButton>
                <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest text-rose-500 hover:bg-rose-500/5 transition-all">
                  <LogOut size={16} />
                  <span>Log Out</span>
                </button>
             </SignOutButton>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
          {/* Header (Mobile Close) */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {activeTab === "general" && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-6 p-6 rounded-3xl bg-white/3 border border-white/5">
                  <div className="h-20 w-20 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl">
                    <img src={user?.imageUrl} alt={user?.fullName || ""} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white">{user?.fullName}</h4>
                    <p className="text-sm text-slate-500">{user?.primaryEmailAddress?.emailAddress}</p>
                    <div className="mt-3 flex items-center gap-2">
                       <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest border border-emerald-500/20">Premium</span>
                       <span className="text-slate-700 text-[10px] font-medium">• Member since {new Date(user?.createdAt || Date.now()).getFullYear()}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="p-5 rounded-3xl border border-white/5 bg-white/2 hover:bg-white/5 transition-colors cursor-pointer group">
                      <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                        <User size={20} />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Identity</p>
                      <p className="text-sm font-medium text-white">{personalizationData.nickname || user?.firstName || "User"}</p>
                   </div>
                   <div className="p-5 rounded-3xl border border-white/5 bg-white/2 hover:bg-white/5 transition-colors cursor-pointer group">
                      <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                        <Briefcase size={20} />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Occupation</p>
                      <p className="text-sm font-medium text-white">{personalizationData.occupation || "Not Set"}</p>
                   </div>
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
                    <div className="grid grid-cols-2 gap-6">
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
                      <div className="flex flex-wrap gap-2">
                        {TONE_OPTIONS.map((tone) => (
                          <button
                            key={tone}
                            onClick={() => setPersonalizationData({...personalizationData, tone})}
                            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
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
                        rows={4}
                        value={personalizationData.customInstructions}
                        onChange={(e) => setPersonalizationData({...personalizationData, customInstructions: e.target.value})}
                        placeholder="How should Velora respond to you?"
                        className="w-full bg-white/3 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/10 transition-all resize-none"
                      />
                    </div>

                    <button
                      onClick={handleSavePersonalization}
                      disabled={isSavingPersonalization}
                      className="w-full flex items-center justify-center gap-2 bg-white text-black py-4 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
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
                <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 mb-4">
                   <div className="flex items-center gap-3">
                      <Brain className="text-emerald-400" size={20} />
                      <div>
                        <p className="text-[11px] font-bold text-white uppercase tracking-widest">Neural Bank</p>
                        <p className="text-[10px] text-emerald-400/60 font-medium">Auto-sync active</p>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{memories.length} / 100</p>
                      <div className="h-1 w-24 bg-white/5 rounded-full mt-1 overflow-hidden">
                         <div className="h-full bg-emerald-500" style={{width: `${Math.min(memories.length, 100)}%`}} />
                      </div>
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
                    {memories.map((memory) => (
                      <div key={memory._id} className="group flex items-start gap-4 p-4 rounded-2xl bg-white/2 border border-white/5 hover:border-white/10 transition-all">
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
                        <button onClick={() => deleteMemory(memory._id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-rose-500 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
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
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 mb-4 flex items-center gap-3">
                   <Archive className="text-amber-400" size={20} />
                   <div>
                     <p className="text-[11px] font-bold text-white uppercase tracking-widest">Archive Vault</p>
                     <p className="text-[10px] text-amber-400/60 font-medium">{localArchivedChats.length} Conversations preserved</p>
                   </div>
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
                    {localArchivedChats.map((chat) => (
                      <div 
                        key={chat._id} 
                        onClick={() => {
                          upsertChat(chat);
                          selectChat(chat._id);
                          onClose();
                        }}
                        className="group flex items-center justify-between p-4 rounded-2xl bg-white/2 border border-white/5 hover:bg-white/5 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                           <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 group-hover:text-amber-400 transition-colors">
                              <MessageSquare size={18} />
                           </div>
                           <div>
                              <p className="text-sm font-bold text-white">{chat.title || "Untitled Session"}</p>
                              <p className="text-[10px] text-slate-600 font-medium">Last active {new Date(chat.updatedAt).toLocaleDateString()}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <button 
                            onClick={() => handleUnarchive(chat._id)}
                            className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
                           >
                             <ArrowLeft size={14} />
                             Restore
                           </button>
                           <button 
                            onClick={() => handleDeleteArchived(chat._id)}
                            className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                           >
                             <Trash2 size={14} />
                           </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "data" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 mb-4">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">AI Identity Portability</h4>
                      <p className="text-[10px] text-blue-400/60 font-bold uppercase tracking-widest">Context Export System</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">
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
                      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                          onClick={() => {
                            navigator.clipboard.writeText(exportSummary);
                            setIsCopied(true);
                            setTimeout(() => setIsCopied(false), 2000);
                            toast.success("Copied to clipboard");
                          }}
                          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md"
                         >
                            {isCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
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
                            <Download size={16} />
                         </button>
                      </div>
                      <pre className="w-full h-[350px] overflow-y-auto bg-black/40 border border-white/5 rounded-3xl p-8 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap selection:bg-white/10">
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
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-4">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Security Controls</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-5 rounded-3xl bg-white/3 border border-white/5">
                      <div>
                        <p className="text-sm font-bold text-white">Encryption</p>
                        <p className="text-[10px] text-slate-500 font-medium">All neural data is end-to-end encrypted</p>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="flex items-center justify-between p-5 rounded-3xl bg-white/3 border border-white/5">
                      <div>
                        <p className="text-sm font-bold text-white">Data Privacy</p>
                        <p className="text-[10px] text-slate-500 font-medium">Manage how your data is used for training</p>
                      </div>
                      <button className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors">Manage</button>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                   <p className="text-[10px] font-bold text-rose-500/60 uppercase tracking-[0.2em] mb-4">Danger Zone</p>
                   <button className="flex items-center gap-3 w-full p-5 rounded-3xl border border-rose-500/20 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-all text-left">
                      <Trash2 size={20} />
                      <div>
                        <p className="text-sm font-bold">Delete Account</p>
                        <p className="text-[10px] opacity-60 font-medium">Permanently wipe all neural and chat history</p>
                      </div>
                   </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default SettingsModal;
