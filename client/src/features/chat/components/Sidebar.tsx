import { memo, useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useChatList } from "@/features/chat/hooks/useChatList";
import { useGroupStore } from "../store/useGroupStore";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Plus,
  X,
  Check,
  Trash2,
  Edit2,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Sparkles,
  Share,
  Users,
  Link as LinkIcon,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  User,
  Settings,
  LogOut,
  Search,
  ListChecks,
  Shield,
} from "lucide-react";
import { useUser, SignOutButton } from "@clerk/react";
import { lazy, Suspense } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ShareModal from "./ShareModal";
import CreateGroupModal from "./CreateGroupModal";
import GroupLinkModal from "./GroupLinkModal";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";

const DeleteConfirmModal = lazy(() => import("./DeleteConfirmModal"));
const GalleryModal = lazy(() => import("./GalleryModal"));
const SettingsModal = lazy(() => import("./SettingsModal"));
const SearchModal = lazy(() => import("./SearchModal"));

/**
 * Sidebar Component
 * Manages the list of chat threads and navigation.
 */
interface UnifiedItem {
  _id: string;
  title: string;
  updatedAt: string;
  itemType: "chat" | "group";
}

interface ItemProps {
  item: UnifiedItem;
  isActive: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (item: UnifiedItem) => void;
  onDelete: (id: string, type: "chat" | "group") => void;
  onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onToggleSelect: (id: string) => void;
  isPinned: boolean;
  isArchived: boolean;
}

const SidebarItem = memo(
  ({
    item,
    isActive,
    isSelectionMode,
    isSelected,
    onSelect,
    onDelete,
    onRename,
    onArchive,
    onUnarchive,
    onPin,
    onUnpin,
    onToggleSelect,
    isPinned,
    isArchived,
  }: ItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(item.title || "");
    const [showMenu, setShowMenu] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isGroupLinkModalOpen, setIsGroupLinkModalOpen] = useState(false);

    const { groups } = useGroupStore();
    const group = groups.find((g) => g._id === item._id);
    const inviteCode = group?.inviteCode || "";

    const itemRef = useRef<HTMLDivElement>(null);
    const [openUpwards, setOpenUpwards] = useState(false);
    const menuButtonRef = useRef<HTMLDivElement>(null);

    const handleStartEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
      setShowMenu(false);
      setEditValue(item.title || "");
    };

    const handleCancel = useCallback((e?: React.MouseEvent) => {
      e?.stopPropagation();
      setIsEditing(false);
      setEditValue(item.title || "");
    }, [item.title]);

    const handleSave = async (e?: React.MouseEvent | React.KeyboardEvent) => {
      e?.stopPropagation();
      if (!editValue.trim() || editValue === item.title) {
        handleCancel();
        return;
      }
      await onRename(item._id, editValue);
      setIsEditing(false);
    };

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          itemRef.current &&
          !itemRef.current.contains(event.target as Node)
        ) {
          if (showMenu) setShowMenu(false);
          if (isEditing) handleCancel();
        }
      };

      if (showMenu || isEditing) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [showMenu, isEditing, handleCancel]);

    useEffect(() => {
      if (showMenu && menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUpwards(spaceBelow < 160);
      }
    }, [showMenu]);

    return (
      <div
        ref={itemRef}
        onClick={() => {
          if (isSelectionMode) {
            if (item.itemType === "chat") onToggleSelect(item._id);
          } else if (!isEditing) {
            onSelect(item);
          }
        }}
        className={`group flex items-center justify-between gap-3 rounded-2xl px-3 py-3 text-[13px] transition-all cursor-pointer border ${
          isActive
            ? "bg-white text-black border-white shadow-[0_15px_35px_-5px_rgba(255,255,255,0.15)] scale-[1.02] z-10"
            : "text-slate-400 border-white/5 hover:bg-slate-800/50 hover:text-white hover:border-transparent"
        } ${isSelected ? "border-emerald-500/50! bg-emerald-500/5" : ""} ${
          isEditing ? "cursor-default" : "cursor-pointer"
        }`}
      >
        <div className="flex flex-1 items-center gap-3 min-w-0">
          {isSelectionMode && item.itemType === "chat" && (
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                isSelected
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-700 bg-transparent"
              }`}
            >
              {isSelected && <Check size={10} strokeWidth={4} />}
            </div>
          )}

          {item.itemType === "group" && (
            group ? (
              <AvatarGroup className="flex-shrink-0">
                {group.members.slice(0, 2).map((member) => (
                  <Avatar key={member.userId} className="h-5 w-5 ring-1 ring-slate-950">
                    {member.userImage && (
                      <AvatarImage src={member.userImage} alt={member.username} className="object-cover" />
                    )}
                    <AvatarFallback className="text-[8px] font-bold bg-zinc-800 text-zinc-300 flex items-center justify-center">
                      {member.username.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {group.members.length > 2 && (
                  <AvatarGroupCount className="h-5 w-5 text-[8px] bg-emerald-500/10 text-emerald-500 ring-1 ring-slate-950 font-bold border-none">
                    +{group.members.length - 2}
                  </AvatarGroupCount>
                )}
              </AvatarGroup>
            ) : (
              <Users
                size={14}
                className={isActive ? "text-emerald-600" : "text-emerald-500/50"}
              />
            )
          )}

          {item.itemType === "chat" && isPinned && !isEditing && (
            <Pin 
              size={12} 
              strokeWidth={2.5} 
              className={`shrink-0 transition-all rotate-[-35deg] ${
                isActive ? "text-black/30" : "text-slate-500/60"
              }`} 
            />
          )}

          {isEditing ? (
            <input
              autoFocus
              className="flex-1 bg-transparent text-inherit border-none outline-none py-0 text-[13px]"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="block truncate font-medium tracking-tight">
              {item.title || "Untitled Session"}
            </span>
          )}
        </div>

        {!isSelectionMode && (
          <div className="flex shrink-0 items-center gap-1">
            {isEditing ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                    isActive
                      ? "text-black/70 hover:bg-black/5"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                  title="Save"
                >
                  <Check size={14} strokeWidth={3} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                    isActive
                      ? "text-black/40 hover:bg-black/5"
                      : "text-slate-500 hover:bg-white/10"
                  }`}
                  title="Cancel"
                >
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="relative" ref={menuButtonRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all outline-none ${
                    isActive
                      ? "text-black/40 hover:text-black"
                      : "text-slate-700 hover:text-white opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <MoreVertical size={14} />
                </button>

                {showMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute right-0 z-50 w-40 rounded-2xl border border-white/5 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 outline-none ${
                      openUpwards
                        ? "bottom-full mb-2 origin-bottom-right"
                        : "top-full mt-2 origin-top-right"
                    }`}
                  >
                    {item.itemType === "chat" && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsShareModalOpen(true);
                            setShowMenu(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all outline-none"
                        >
                          <Share size={12} />
                          <span>Share</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsGroupModalOpen(true);
                            setShowMenu(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all outline-none"
                        >
                          <Users size={12} />
                          <span>Create Group</span>
                        </button>

                        <button
                          onClick={handleStartEdit}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all outline-none"
                        >
                          <Edit2 size={12} />
                          <span>Rename</span>
                        </button>

                        {isArchived ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnarchive(item._id);
                              setShowMenu(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all outline-none"
                          >
                            <ArchiveRestore size={12} />
                            <span>Unarchive</span>
                          </button>
                        ) : (
                          <>
                            {isPinned ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUnpin(item._id);
                                  setShowMenu(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all outline-none"
                              >
                                <PinOff size={12} className="rotate-[-35deg]" />
                                <span>Unpin</span>
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPin(item._id);
                                  setShowMenu(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all outline-none"
                              >
                                <Pin size={12} className="rotate-[-35deg]" />
                                <span>Pin</span>
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  onArchive(item._id);
                                  setShowMenu(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-amber-400 transition-all outline-none"
                            >
                              <Archive size={12} />
                              <span>Archive</span>
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {item.itemType === "group" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsGroupLinkModalOpen(true);
                          setShowMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all outline-none"
                      >
                        <LinkIcon size={12} />
                        <span>Group Link</span>
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete(item._id, item.itemType);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-red-400 transition-all outline-none"
                    >
                      <Trash2 size={12} />
                      <span>
                        {item.itemType === "group" ? "Leave Group" : "Delete"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {item.itemType === "chat" && (
          <>
            <ShareModal
              isOpen={isShareModalOpen}
              onClose={() => setIsShareModalOpen(false)}
              chatId={item._id}
            />
            <CreateGroupModal
              isOpen={isGroupModalOpen}
              onClose={() => setIsGroupModalOpen(false)}
              chatId={item._id}
            />
          </>
        )}

        {item.itemType === "group" && (
          <GroupLinkModal
            isOpen={isGroupLinkModalOpen}
            onClose={() => setIsGroupLinkModalOpen(false)}
            inviteCode={inviteCode}
          />
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isActive === nextProps.isActive &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isSelectionMode === nextProps.isSelectionMode &&
      prevProps.item._id === nextProps.item._id &&
      prevProps.item.title === nextProps.item.title &&
      prevProps.isPinned === nextProps.isPinned &&
      prevProps.isArchived === nextProps.isArchived &&
      prevProps.item.updatedAt === nextProps.item.updatedAt
    );
  }
);

const Sidebar = () => {
  const { chatId: urlChatId, groupId: urlGroupId } = useParams<{ chatId?: string; groupId?: string }>();
  const location = useLocation();
  const { sidebarOpen, setSidebarOpen, isStreaming, streamingChatId } =
    useChatStore();
  const { groups, setGroups, currentGroupId, setCurrentGroup, removeGroup } =
    useGroupStore();
  const { user } = useUser();
  const navigate = useNavigate();
  const {
    chats,
    currentChatId,
    createChat,
    deleteChat,
    deleteChats,
    renameChat,
    archiveChat,
    unarchiveChat,
    pinChat,
    unpinChat,
    selectChat,
    fetchMoreChats,
    hasMore,
    loading,
    viewingArchived,
  } = useChatList();

  const [showRecent, setShowRecent] = useState(true);
  const [deleteConfig, setDeleteConfig] = useState<{
    id: string;
    type: "chat" | "group";
  } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get("/user/profile")
      .then(({ data }) => {
        setIsAdmin(data.role === "admin");
      })
      .catch(err => {
        console.error("Failed to fetch user role for sidebar:", err);
      });
  }, [user]);

  const [searchModalOpen, setSearchModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const activeChatId = urlChatId || currentChatId;
  const isSearchNavigation = new URLSearchParams(location.search).has("highlight");
  const isStreamingActiveChat = Boolean(
    activeChatId && isStreaming && streamingChatId === activeChatId,
  );
  const shouldPromoteActiveChat = isSearchNavigation || isStreamingActiveChat;
  const filteredChats = useMemo(() => {
    return chats
      .filter((c) => c.isArchived === viewingArchived)
      .sort((a, b) => {
        // 1. Pinned chats stay first.
      if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
  
      // 2. Search-selected or currently streaming chats sit at the top of
      // their section, below pinned chats.
      if (shouldPromoteActiveChat) {
        if (a._id === activeChatId) return -1;
        if (b._id === activeChatId) return 1;
      }

      // 3. Finally, sort by update time (most recent first).
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
      });
  }, [chats, viewingArchived]);

  const observerTarget = useRef<HTMLDivElement>(null);

  // Merge and sort chats and groups
  const unifiedList = useMemo(() => {
    const combined: UnifiedItem[] = [
      ...filteredChats.map((c) => ({
        _id: c._id,
        title: c.title,
        updatedAt: c.updatedAt || "",
        itemType: "chat" as const,
      })),
      ...(!viewingArchived ? groups.map((g) => ({
        _id: g._id,
        title: g.title,
        updatedAt: g.updatedAt,
        itemType: "group" as const,
      })) : []),
    ];
    return combined.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [filteredChats, groups, viewingArchived]);
  const chatListScrollRef = useRef<HTMLDivElement>(null);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredChats.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredChats.map((c) => c._id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    await deleteChats(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    setShowBulkDeleteConfirm(false);
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      await api.post(`/group/${groupId}/leave`, { userId: user?.id });
      removeGroup(groupId);
      if (currentGroupId === groupId) {
        setCurrentGroup(null);
        navigate("/chat");
      }
    } catch (err) {
      console.error("Failed to leave group:", err);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchMoreChats();
        }
      },
      { threshold: 1.0 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, fetchMoreChats]);

  useEffect(() => {
    if (user?.id) {
      api
        .get("/group/user-groups", { params: { userId: user.id } })
        .then((res) => {
          setGroups(res.data);
        });
    }
  }, [user?.id, setGroups]);

  useEffect(() => {
    if (!activeChatId || !showRecent || !shouldPromoteActiveChat) return;

    const frame = window.requestAnimationFrame(() => {
      chatListScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeChatId, filteredChats.length, shouldPromoteActiveChat, showRecent]);

  return (
    <>
      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md md:hidden animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
        fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col gap-5 border-r border-white/5 bg-slate-950 p-6 transition-transform duration-300 ease-in-out md:relative md:w-80 md:translate-x-0 md:max-h-screen md:overflow-hidden
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3 group text-white">
            <img
              src="/logo.png"
              alt="Velora Logo"
              className="h-6 w-6 object-contain"
            />
            <h2 className="font-display text-base font-bold tracking-tight text-white leading-none">
              Velora
            </h2>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-slate-500 hover:text-white md:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={createChat}
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-white px-4 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-black transition-all hover:bg-slate-100 shadow-xl shadow-black/20"
          >
            <Plus size={16} strokeWidth={3} />
            <span>New Chat</span>
          </button>

          <button
            onClick={() => setGalleryOpen(true)}
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white transition-all hover:bg-white/8 shadow-xl shadow-black/10"
          >
            <ImageIcon size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>Gallery</span>
          </button>
        </div>

        <div className="px-2">
          <button
            onClick={() => setSearchModalOpen(true)}
            className="w-full relative group flex items-center bg-white/3 border border-white/5 rounded-xl py-2.5 px-3 text-[12px] text-slate-500 transition-all hover:bg-white/5"
          >
            <Search size={14} className="mr-3" />
            <span>Search conversations...</span>
            <div className="ml-auto flex items-center gap-1 opacity-40">
              <kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 font-sans text-[10px]">⌘</kbd>
              <kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 font-sans text-[10px]">K</kbd>
            </div>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between px-2 pb-2">
            <div
              onClick={() => setShowRecent((prev) => !prev)}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600 group-hover:text-slate-400 transition-colors">
                {viewingArchived ? "Archived Chats" : "Session History"}
              </span>
              <span className="text-slate-700 text-xs group-hover:text-white transition">
                {showRecent ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </span>
            </div>

            {filteredChats.length > 0 && showRecent && (
              <button
                onClick={() => {
                  if (isSelectionMode) {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  } else {
                    setIsSelectionMode(true);
                  }
                }}
                className={`flex h-6 w-6 items-center justify-center rounded-lg transition-all ${
                  isSelectionMode
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-slate-600 hover:bg-white/5 hover:text-slate-300"
                }`}
                title={isSelectionMode ? "Exit Selection" : "Bulk Actions"}
              >
                {isSelectionMode ? <X size={14} /> : <ListChecks size={14} />}
              </button>
            )}
          </div>

          {isSelectionMode && showRecent && (
            <div className="flex items-center justify-between px-3 py-2.5 mb-2 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 animate-in fade-in slide-in-from-top-2 duration-300">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400/80 hover:text-emerald-400 transition-all"
              >
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded-md border transition-all ${
                    selectedIds.size === filteredChats.length &&
                    filteredChats.length > 0
                      ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                      : "border-emerald-500/30 bg-transparent"
                  }`}
                >
                  {selectedIds.size === filteredChats.length &&
                    filteredChats.length > 0 && (
                      <Check size={10} strokeWidth={4} />
                    )}
                </div>
                <span>All</span>
              </button>

              <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-all"
                  >
                    <Trash2 size={12} />
                    <span>Delete ({selectedIds.size})</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showRecent && (
            <div ref={chatListScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-2">
              <div className="flex flex-col gap-3">
                {unifiedList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/5 bg-white/1 p-10 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-800">
                      Empty
                    </p>
                  </div>
                ) : (
                  unifiedList.map((item) => {
                    const chat = chats.find((c) => c._id === item._id);
                    return (
                      <SidebarItem
                        key={item._id}
                        item={item}
                        isActive={
                          item.itemType === "chat"
                            ? currentChatId === item._id
                            : urlGroupId === item._id
                        }
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedIds.has(item._id)}
                        onSelect={(target) => {
                          if (target.itemType === "chat") {
                            selectChat(target._id);
                          } else {
                            setCurrentGroup(target._id);
                            setSidebarOpen(false);
                            navigate(`/group/${target._id}`);
                          }
                        }}
                        onDelete={(id, type) => setDeleteConfig({ id, type })}
                        onRename={renameChat}
                        onArchive={archiveChat}
                        onUnarchive={unarchiveChat}
                        onPin={pinChat}
                        onUnpin={unpinChat}
                        onToggleSelect={toggleSelect}
                        isPinned={chat?.isPinned || false}
                        isArchived={chat?.isArchived || false}
                      />
                    );
                  })
                )}

                {/* Intersection Observer Sentinel */}
                {(hasMore || filteredChats.length > 0) && (
                  <div ref={observerTarget} className="h-4 w-full mt-2" />
                )}

                {hasMore && loading && (
                  <div className="flex justify-center p-4">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Section */}
        <div className="mt-auto pt-3 border-t border-white/5 relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-2xl transition-all group text-left border border-transparent hover:bg-slate-800/50 data-[state=open]:bg-white/10 outline-none focus:ring-0">
                <div className={`h-9 w-9 rounded-xl overflow-hidden transition-all shadow-inner ${
                  isAdmin 
                    ? "border border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.3)] ring-1 ring-amber-500/20" 
                    : "border border-white/5"
                }`}>
                  {user?.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.fullName || "User"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-slate-800 flex items-center justify-center">
                      <User size={16} className="text-slate-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate leading-tight">
                    {user?.fullName || "User"}
                  </p>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[7px] font-bold uppercase tracking-widest border border-amber-500/20 mt-0.5 shadow-[0_0_8px_rgba(245,158,11,0.15)]">
                      Admin
                    </span>
                  )}
                </div>
                <MoreVertical
                  size={16}
                  className="text-slate-600 group-hover:text-white transition-colors group-data-[state=open]:text-white"
                />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={12}
              className="w-72 bg-slate-900/95 backdrop-blur-xl border border-white/5 p-1.5 animate-in fade-in zoom-in-95 duration-200 outline-none focus:ring-0"
            >
              {isAdmin && (
                <DropdownMenuItem
                  onClick={() => navigate("/admin")}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-400 focus:bg-amber-500/10 focus:text-amber-400 bg-amber-500/5 border border-amber-500/10 mb-1.5 transition-all cursor-pointer"
                >
                  <Shield size={16} className="text-amber-400 animate-pulse" />
                  <span>Admin Panel</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onClick={() => {
                  setSettingsTab("general");
                  setSettingsOpen(true);
                }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-300 focus:bg-white/5 focus:text-white transition-all cursor-pointer"
              >
                <User size={16} className="text-slate-400" />
                <span>Profile</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  setSettingsTab("personalization");
                  setSettingsOpen(true);
                }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-300 focus:bg-white/5 focus:text-white transition-all cursor-pointer"
              >
                <Sparkles size={16} className="text-slate-400"  />
                <span>Personalization</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => {
                  setSettingsTab("general");
                  setSettingsOpen(true);
                }}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-300 focus:bg-white/5 focus:text-white transition-all cursor-pointer"
              >
                <Settings size={16} className="text-slate-400" />
                <span>Settings</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-white/5" />

              <SignOutButton>
                <DropdownMenuItem className="flex items-center gap-3 rounded-xl px-4 py-3 text-[11px] font-bold uppercase tracking-[0.15em] text-rose-400 focus:bg-rose-400/10 focus:text-rose-400 transition-all cursor-pointer">
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </SignOutButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <Suspense fallback={null}>
        <DeleteConfirmModal
          isOpen={!!deleteConfig || showBulkDeleteConfirm}
          onClose={() => {
            setDeleteConfig(null);
            setShowBulkDeleteConfirm(false);
          }}
          onConfirm={() => {
            if (deleteConfig) {
              if (deleteConfig.type === "chat") {
                deleteChat(deleteConfig.id);
              } else {
                handleLeaveGroup(deleteConfig.id);
              }
              setDeleteConfig(null);
            } else if (showBulkDeleteConfirm) {
              confirmBulkDelete();
            }
          }}
          purpose={
            showBulkDeleteConfirm
              ? `Delete ${selectedIds.size} Chats`
              : deleteConfig?.type === "group"
                ? "Leave"
                : "Delete"
          }
          title={
            showBulkDeleteConfirm
              ? "Delete Multiple Chats"
              : deleteConfig?.type === "group"
                ? "Leave Group"
                : undefined
          }
          message={
            showBulkDeleteConfirm
              ? `Are you sure you want to delete ${selectedIds.size} selected chats? This action cannot be undone.`
              : deleteConfig?.type === "group"
                ? "Are you sure you want to leave this group chat?"
                : undefined
          }
        />

        <GalleryModal
          isOpen={galleryOpen}
          onClose={() => setGalleryOpen(false)}
        />

        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsTab}
        />

        <SearchModal 
          isOpen={searchModalOpen} 
          onClose={() => setSearchModalOpen(false)} 
        />
      </Suspense>
    </>
  );
};

export default memo(Sidebar);
