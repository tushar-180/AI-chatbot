import { memo } from "react";
import { UserButton, useUser } from "@clerk/react";
import { Sparkles, Menu, Cpu } from "lucide-react";
import { useChatStore } from "@/features/chat/store/useChatStore";

interface ChatHeaderProps {
  currentChatId: string | null;
  onMenuClick: () => void;
}

const ChatHeader = ({ currentChatId, onMenuClick }: ChatHeaderProps) => {
  const { user } = useUser();
  const chats = useChatStore((state) => state.chats);
  const isStreaming = useChatStore((state) => state.isStreaming);

  const currentChat = chats.find((chat) => chat._id === currentChatId);
  const chatTitle = currentChat?.title || "New Conversation";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/40 backdrop-blur-xl transition-all duration-300 shadow-sm">
      {/* Animated gradient accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-indigo-500/50 to-transparent opacity-50" />

      <div className="mx-auto flex h-16 items-center justify-between px-4 md:px-8 relative">
        {/* Left Section: Mobile Menu & Chat Title */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={onMenuClick}
            className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900/40 text-slate-400 ring-1 ring-white/10 backdrop-blur-md hover:bg-slate-800/60 hover:text-white hover:ring-indigo-500/50 transition-all duration-300 md:hidden"
            aria-label="Toggle menu"
          >
            <Menu
              size={20}
              className="transition-transform group-hover:scale-110"
            />
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-sm md:text-lg font-bold text-slate-100 truncate">
                  {chatTitle}
                </h1>
                {isStreaming && (
                  <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: User & Actions */}
        <div className="flex items-center justify-end gap-3 shrink-0 pl-4">
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-xs font-bold text-slate-200 leading-tight">
              Hello, {user?.firstName || user?.username || "Guest User"}
            </span>
          </div>

          <div className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-slate-900/40 ring-1 ring-white/10 backdrop-blur-md hover:ring-indigo-500/30 transition-all duration-300 overflow-hidden group shadow-inner">
            <div className="absolute inset-0 bg-linear-to-tr from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "h-8 w-8 rounded-lg",
                  userButtonTrigger: "h-10 w-10",
                },
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default memo(ChatHeader);
