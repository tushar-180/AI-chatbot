import { memo, useState, useRef, useEffect } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useChatList } from "@/features/chat/hooks/useChatList";
import {
  Plus,
  MessageSquare,
  LayoutDashboard,
  Sparkles,
  X,
  Trash2,
  Edit2,
  Check,
  MoreVertical,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import DeleteConfirmModal from "./DeleteConfirmModal";

/**
 * Sidebar Component
 * Manages the list of chat threads and navigation.
 */
interface ChatItemProps {
  chat: any;
  currentChatId: string | null;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
}

const SidebarChatItem = memo(
  ({ chat, isActive, onSelect, onDelete, onRename }: ChatItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(chat.title || "");
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(event.target as Node)
        ) {
          setShowMenu(false);
        }
      };
      if (showMenu) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
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
        onClick={() => !isEditing && onSelect(chat._id)}
        className={`group flex items-center justify-between gap-3 rounded-2xl px-2 py-1.5 text-sm transition-all cursor-pointer ${
          isActive
            ? "bg-white/10 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-all duration-200"
        }`}
      >
        <div className="flex flex-1 items-center gap-3 truncate">
          <div />
          {isEditing ? (
            <input
              autoFocus
              className="flex-1 bg-slate-800 text-white border-none outline-none rounded px-2 py-0.5 text-sm ring-1 ring-indigo-500"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate font-medium">
              {chat.title || "Untitled chat"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <div
                onClick={handleSave}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 hover:bg-slate-800 transition-all"
              >
                <Check size={14} />
              </div>
              <div
                onClick={handleCancel}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-all"
              >
                <X size={14} />
              </div>
            </div>
          ) : (
            <div className="relative" ref={menuRef}>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-all ${
                  showMenu
                    ? "bg-slate-800 text-white"
                    : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <MoreVertical size={14} />
              </div>

              {showMenu && (
                <div className="absolute right-0 top-full z-50 mt-1 w-32 origin-top-right rounded-xl border border-slate-800 bg-slate-900 p-1 shadow-2xl animate-in fade-in zoom-in duration-200">
                  <button
                    onClick={handleStartEdit}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
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
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        onDelete(chat._id); // 👈 open modal
                      }}
                    >
                      Delete
                    </span>{" "}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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
    renameChat,
    selectChat,
  } = useChatList();
  const [showRecent, setShowRecent] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <>
      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
        fixed inset-y-0 left-0 z-50 flex h-full w-70 flex-col gap-6 border-slate-800/60 bg-slate-950 p-5 transition-transform duration-300 ease-in-out md:relative md:w-80 md:translate-x-0 md:border-r md:max-h-screen md:overflow-y-auto
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl">
              <img src="./logo.png" alt="" className="w-10 h-10" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight text-white leading-none">
                Velora
              </h2>
              <p className="mt-1.5 text-[10px] uppercase tracking-[0.25em] font-bold text-slate-500">
                Always with you
              </p>
            </div>
          </div>

          {/* Close Button - Only on Mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-slate-400 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <button
          onClick={createChat}
          className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-white px-4 py-3 text-sm font-display font-bold text-slate-950 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-white/5"
        >
          <Plus size={18} strokeWidth={3} />
          <span>New Chat</span>
        </button>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {chats.length > 0 && (
            <div
              onClick={() => setShowRecent((prev) => !prev)}
              className="flex items-center justify-between px-2 pb-2 cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard size={14} className="text-slate-500" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  Recent
                </span>
              </div>

              <span className="text-slate-500 text-xs group-hover:text-white transition">
                {showRecent ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </span>
            </div>
          )}

          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center">
              <MessageSquare size={24} className="text-slate-700" />
              <p className="text-xs font-medium text-slate-500">
                No conversations yet.
              </p>
            </div>
          ) : (
            showRecent && (
              <div className="flex flex-col gap-1.5">
                {chats.map((chat) => (
                  <SidebarChatItem
                    key={chat._id}
                    chat={chat}
                    currentChatId={currentChatId}
                    isActive={currentChatId === chat._id}
                    onSelect={selectChat}
                    onDelete={(id) => setDeleteId(id)}
                  
                    onRename={renameChat}
                  />
                ))}
              </div>
            )
          )}
         </div>
      </aside>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteChat(deleteId);
          setDeleteId(null);
        }}
      />
    </>
  );
};

export default memo(Sidebar);