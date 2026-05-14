import { memo, useState, useRef, useEffect } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useChatList } from "@/features/chat/hooks/useChatList";
import type { Chat } from "@/features/chat/types/chat.types";
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
  Brain,
  Sparkles,
  Archive,
  ArchiveRestore,
  History,
  Pin,
  PinOff,
  User,
  Settings,
  LogOut,
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
const DeleteConfirmModal = lazy(() => import("./DeleteConfirmModal"));
const GalleryModal = lazy(() => import("./GalleryModal"));
const SettingsModal = lazy(() => import("./SettingsModal"));

/**
 * Sidebar Component
 * Manages the list of chat threads and navigation.
 */
interface ChatItemProps {
  chat: Chat;
  currentChatId: string | null;
  isActive: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

const SidebarChatItem = memo(
  ({
    chat,
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
  }: ChatItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(chat.title || "");
    const itemRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          itemRef.current &&
          !itemRef.current.contains(event.target as Node)
        ) {
          if (isEditing) handleCancel();
        }
      };

      if (isEditing) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isEditing]);

    const handleStartEdit = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setIsEditing(true);
      setEditValue(chat.title || "");
    };

    const handleCancel = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setIsEditing(false);
      setEditValue(chat.title || "");
    };

    const handleSave = async (e?: React.MouseEvent | React.KeyboardEvent) => {
      e?.stopPropagation();
      if (!editValue.trim() || editValue === chat.title) {
        handleCancel();
        return;
      }
      await onRename(chat._id, editValue);
      setIsEditing(false);
    };

    return (
      <div
        ref={itemRef}
        onClick={() => {
          if (isSelectionMode) {
            onToggleSelect(chat._id);
          } else if (!isEditing) {
            onSelect(chat._id);
          }
        }}
        className={`group flex items-center justify-between gap-3 rounded-2xl px-3 py-3 text-[13px] transition-all cursor-pointer border ${
          isActive
            ? "bg-white text-black border-white shadow-[0_10px_30px_-5px_rgba(255,255,255,0.1)]"
            : "text-slate-400 border-white/5 hover:bg-slate-800/50 hover:text-white hover:border-transparent"
        } ${isSelected ? "!border-emerald-500/50 bg-emerald-500/5" : ""} ${
          isEditing ? "cursor-default" : "cursor-pointer"
        }`}
      >
        <div className="flex flex-1 items-center gap-3 min-w-0">
          {isSelectionMode && (
            <div
              className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${
                isSelected
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-700 bg-transparent"
              }`}
            >
              {isSelected && <Check size={10} strokeWidth={4} />}
            </div>
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
              {chat.title || "Untitled Session"}
            </span>
          )}
          {chat.isPinned && !isEditing && (
            <Pin size={10} className="text-emerald-500 fill-emerald-500" />
          )}
        </div>

        {!isSelectionMode && (
          <div className="flex flex-shrink-0 items-center gap-1">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                    isActive
                      ? "text-emerald-600 hover:bg-emerald-50"
                      : "text-emerald-500 hover:bg-emerald-500/10"
                  }`}
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                    isActive
                      ? "text-rose-600 hover:bg-rose-50"
                      : "text-rose-500 hover:bg-rose-500/10"
                  }`}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all outline-none ${
                      isActive
                        ? "text-black/40 hover:text-black"
                        : "text-slate-700 hover:text-white opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <MoreVertical size={14} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-40 rounded-2xl border border-white/5 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 z-[100] outline-none focus:ring-0"
                >
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all cursor-pointer outline-none focus:bg-white/5 focus:text-white"
                  >
                    <Edit2 size={12} />
                    <span>Rename</span>
                  </DropdownMenuItem>

                  {chat.isArchived ? (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnarchive(chat._id);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-emerald-400 transition-all cursor-pointer outline-none focus:bg-white/5 focus:text-emerald-400"
                    >
                      <ArchiveRestore size={12} />
                      <span>Unarchive</span>
                    </DropdownMenuItem>
                  ) : (
                    <>
                      {chat.isPinned ? (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onUnpin(chat._id);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-emerald-400 transition-all cursor-pointer outline-none focus:bg-white/5 focus:text-emerald-400"
                        >
                          <PinOff size={12} />
                          <span>Unpin</span>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onPin(chat._id);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-emerald-400 transition-all cursor-pointer outline-none focus:bg-white/5 focus:text-emerald-400"
                        >
                          <Pin size={12} />
                          <span>Pin</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive(chat._id);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-amber-400 transition-all cursor-pointer outline-none focus:bg-white/5 focus:text-amber-400"
                      >
                        <Archive size={12} />
                        <span>Archive</span>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(chat._id);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-red-400 transition-all cursor-pointer outline-none focus:bg-white/5 focus:text-red-400"
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    );
  },
);

const Sidebar = () => {
  const { sidebarOpen, setSidebarOpen } = useChatStore();
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
    viewingArchived,
    setViewingArchived,
  } = useChatList();
  const [showRecent, setShowRecent] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const { user } = useUser();

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const filteredChats = chats
    .filter((c) => c.isArchived === viewingArchived)
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });

  const observerTarget = useRef<HTMLDivElement>(null);

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
          <div className="flex items-center gap-3 group">
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
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-4 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-white/8"
          >
            <ImageIcon size={16} />
            <span>Gallery</span>
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
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedIds(new Set());
                }}
                className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  isSelectionMode
                    ? "text-emerald-400"
                    : "text-slate-600 hover:text-slate-400"
                }`}
              >
                {isSelectionMode ? "Done" : "Edit"}
              </button>
            )}
          </div>

          {isSelectionMode && showRecent && (
            <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-xl bg-white/5 border border-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-all"
              >
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${
                    selectedIds.size === filteredChats.length &&
                    filteredChats.length > 0
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-700 bg-transparent"
                  }`}
                >
                  {selectedIds.size === filteredChats.length &&
                    filteredChats.length > 0 && (
                      <Check size={10} strokeWidth={4} />
                    )}
                </div>
                <span>Select All</span>
              </button>

              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-all"
                >
                  <Trash2 size={12} />
                  <span>Delete ({selectedIds.size})</span>
                </button>
              )}
            </div>
          )}

          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/5 bg-white/1 p-10 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-800">
                Empty
              </p>
            </div>
          ) : (
            showRecent && (
              <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                <div className="flex flex-col gap-3">
                  {filteredChats.map((chat) => (
                    <SidebarChatItem
                      key={chat._id}
                      chat={chat}
                      currentChatId={currentChatId}
                      isActive={currentChatId === chat._id}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedIds.has(chat._id)}
                      onSelect={selectChat}
                      onDelete={(id) => setDeleteId(id)}
                      onRename={renameChat}
                      onArchive={archiveChat}
                      onUnarchive={unarchiveChat}
                      onPin={pinChat}
                      onUnpin={unpinChat}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                  {/* Intersection Observer Sentinel */}
                  <div ref={observerTarget} className="h-4 w-full" />
                  {hasMore && (
                    <div className="flex justify-center p-4">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Profile Section */}
        <div className="mt-auto pt-3 border-t border-white/5 relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-2xl transition-all group text-left border border-transparent hover:bg-slate-800/50 data-[state=open]:bg-white/10 outline-none focus:ring-0">
                <div className="h-9 w-9 rounded-xl overflow-hidden border border-white/5 transition-colors shadow-inner">
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
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-[0.2em] mt-0.5 opacity-80">
                    Premium
                  </p>
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
          isOpen={!!deleteId || showBulkDeleteConfirm}
          onClose={() => {
            setDeleteId(null);
            setShowBulkDeleteConfirm(false);
          }}
          onConfirm={() => {
            if (deleteId) {
              deleteChat(deleteId);
              setDeleteId(null);
            } else if (showBulkDeleteConfirm) {
              confirmBulkDelete();
            }
          }}
          title={showBulkDeleteConfirm ? "Delete Multiple Chats" : undefined}
          message={
            showBulkDeleteConfirm
              ? `Are you sure you want to delete ${selectedIds.size} selected chats? This action cannot be undone.`
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
      </Suspense>
    </>
  );
};

export default memo(Sidebar);
