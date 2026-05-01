import { memo } from "react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useChatList } from "@/features/chat/hooks/useChatList";
import {
  Plus,
  MessageSquare,
  LayoutDashboard,
  Sparkles,
  X,
  Trash2,
} from "lucide-react";

/**
 * Sidebar Component
 * Manages the list of chat threads and navigation.
 */
const Sidebar = () => {
  const { sidebarOpen, setSidebarOpen } = useChatStore();
  const { chats, currentChatId, createChat, deleteChat, selectChat } =
    useChatList();

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
        fixed inset-y-0 left-0 z-50 flex h-full w-[280px] flex-col gap-6 border-slate-800/60 bg-slate-950 p-5 transition-transform duration-300 ease-in-out md:relative md:w-80 md:translate-x-0 md:border-r md:max-h-screen md:overflow-y-auto
        ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }
      `}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-tr from-indigo-600 to-sky-500 text-white shadow-lg shadow-indigo-500/20">
              <Sparkles size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white leading-none">
                Code-Bot
              </h2>
              <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold text-slate-500">
                v1.0 Professional
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
          className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-white/5"
        >
          <Plus size={18} strokeWidth={3} />
          <span>New Chat</span>
        </button>

        <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1">
          <div className="flex items-center gap-2 px-2 pb-2">
            <LayoutDashboard size={14} className="text-slate-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Recent Threads
            </span>
          </div>

          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center">
              <MessageSquare size={24} className="text-slate-700" />
              <p className="text-xs font-medium text-slate-500">
                No conversations yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {chats.map((chat) => (
                <button
                  key={chat._id}
                  onClick={() => { selectChat(chat._id); console.log("i clicked")}}
                  className={`group flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-sm transition-all ${
                    currentChatId === chat._id
                      ? "bg-slate-900 text-white shadow-lg ring-1 ring-slate-800"
                      : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div
                      className={`flex h-2 w-2 shrink-0 rounded-full transition-all ${
                        currentChatId === chat._id
                          ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                          : "bg-slate-700 group-hover:bg-slate-500"
                      }`}
                    />
                    <span className="truncate font-medium">
                      {chat.title || "Untitled chat"}
                    </span>
                  </div>

                  {/* Delete Button - Hidden by default, visible on hover */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat._id);
                    }}
                    className="opacity-0 group-hover:opacity-100 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={14} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto border-t border-slate-800 pt-6 px-2 text-[10px] font-medium text-slate-600">
          <div className="flex items-center justify-between">
            <span>&copy; 2026 Code-Bot • Tushar</span>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-slate-500">AI Online</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default memo(Sidebar);
