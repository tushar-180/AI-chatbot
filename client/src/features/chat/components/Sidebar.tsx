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
  Share,
} from "lucide-react";
import { lazy, Suspense } from "react";
import ShareModal from "./ShareModal";
const DeleteConfirmModal = lazy(() => import("./DeleteConfirmModal"));
const GalleryModal = lazy(() => import("./GalleryModal"));
const MemoryModal = lazy(() => import("./MemoryModal"));
const PersonalizationModal = lazy(() => import("./PersonalizationModal"));

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
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
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
    onToggleSelect,
  }: ChatItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(chat.title || "");
    const [showMenu, setShowMenu] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    const itemRef = useRef<HTMLDivElement>(null);
    const [openUpwards, setOpenUpwards] = useState(false);
    const menuButtonRef = useRef<HTMLDivElement>(null);

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
    }, [showMenu, isEditing]);

    useEffect(() => {
      if (showMenu && menuButtonRef.current) {
        const rect = menuButtonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUpwards(spaceBelow < 160);
      }
    }, [showMenu]);

    const handleStartEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
      setShowMenu(false);
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
            : "text-slate-400 border-white/3 hover:bg-white/5 hover:text-white"
        } ${isSelected ? "!border-emerald-500/50 bg-emerald-500/5" : ""} ${
          isEditing ? "cursor-default" : "cursor-pointer"
        }`}
      >
        <div className="flex flex-1 items-center gap-3 min-w-0">
          {isSelectionMode && (
            <div
              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-all ${
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
              <div className="relative" ref={menuButtonRef}>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                    isActive
                      ? "text-black/40 hover:text-black"
                      : "text-slate-700 hover:text-white opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <MoreVertical size={14} />
                </div>

                {showMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute right-0 z-50 w-36 rounded-2xl border border-white/10 bg-slate-900 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in duration-200 ${
                      openUpwards
                        ? "bottom-full mb-2 origin-bottom-right"
                        : "top-full mt-2 origin-top-right"
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsShareModalOpen(true);
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all"
                    >
                      <Share size={16} />
                      <span>Share</span>
                    </button>

                    <button
                      onClick={handleStartEdit}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-white transition-all"
                    >
                      <Edit2 size={12} />
                      <span>Rename</span>
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete(chat._id);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {chat._id && (
          <ShareModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            chatId={chat._id}
          />
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
    selectChat,
    fetchMoreChats,
    hasMore,
  } = useChatList();
  const [showRecent, setShowRecent] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [personalizationOpen, setPersonalizationOpen] = useState(false);

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const observerTarget = useRef<HTMLDivElement>(null);

  const toggleSelectAll = () => {
    if (selectedIds.size === chats.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(chats.map((c) => c._id)));
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
      { threshold: 1.0 }
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
        fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col gap-8 border-r border-white/5 bg-slate-950 p-6 transition-transform duration-300 ease-in-out md:relative md:w-80 md:translate-x-0 md:max-h-screen md:overflow-y-auto
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

          <button
            onClick={() => setMemoryOpen(true)}
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-4 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-white/8"
          >
            <Brain size={16} />
            <span>Memory</span>
          </button>

          <button
            onClick={() => setPersonalizationOpen(true)}
            className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/5 bg-white/3 px-4 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-white/8"
          >
            <Sparkles size={16} className="text-emerald-400" />
            <span>Personalization</span>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between px-2 pb-4">
            <div
              onClick={() => setShowRecent((prev) => !prev)}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600 group-hover:text-slate-400 transition-colors">
                Session History
              </span>
              <span className="text-slate-700 text-xs group-hover:text-white transition">
                {showRecent ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </span>
            </div>

            {chats.length > 0 && showRecent && (
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
                    selectedIds.size === chats.length && chats.length > 0
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-700 bg-transparent"
                  }`}
                >
                  {selectedIds.size === chats.length && chats.length > 0 && (
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

          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/5 bg-white/1 p-10 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-800">
                Empty
              </p>
            </div>
          ) : (
            showRecent && (
              <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                <div className="flex flex-col gap-3">
                  {chats.map((chat) => (
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

        <MemoryModal isOpen={memoryOpen} onClose={() => setMemoryOpen(false)} />

        <PersonalizationModal
          isOpen={personalizationOpen}
          onClose={() => setPersonalizationOpen(false)}
        />
      </Suspense>
    </>
  );
};

export default memo(Sidebar);
