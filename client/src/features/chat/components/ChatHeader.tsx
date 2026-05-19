import { memo } from "react";
import { UserButton } from "@clerk/react";
import { Menu, Share, LogOut } from "lucide-react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useTemporaryChatStore } from "@/features/chat/store/useTemporaryChatStore";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ShareModal from "./ShareModal";

interface ChatHeaderProps {
  currentChatId: string | null;
  onMenuClick: () => void;
  chatTitle?: string;
}

const ChatHeader = ({ currentChatId, onMenuClick ,chatTitle}: ChatHeaderProps) => {
  const isTemporaryChatActive = useTemporaryChatStore((state) => state.isTemporaryChatActive);
  const chats = useChatStore((state) => state.chats);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const streamingChatId = useChatStore((state) => state.streamingChatId);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleExitTempChat = () => {
    useTemporaryChatStore.getState().setTemporaryChatActive(false);
    useTemporaryChatStore.getState().clearStore();
    navigate("/chat");
  };

  const currentChat = chats.find((chat) => chat._id === currentChatId);
  chatTitle = isTemporaryChatActive
    ? "Temporary Chat"
    : chatTitle || currentChat?.title || "New Conversation";
  const isStreamingCurrentChat =
    isStreaming && !!currentChatId && streamingChatId === currentChatId;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#030712]">
      <div className="mx-auto flex h-14 items-center justify-between px-6 md:px-8">
        {/* Left Section */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={onMenuClick}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-500 hover:text-white md:hidden"
          >
            <Menu size={16} />
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-sans text-[14px] font-medium tracking-tight text-white/90 truncate">
              {chatTitle}
            </h1>
            {isTemporaryChatActive && (
              <div className="flex items-center gap-2 rounded-full bg-emerald-500/5 border border-emerald-500/20 px-3 py-1 text-[9px] font-extrabold uppercase tracking-widest text-emerald-400 select-none shadow-[0_0_15px_rgba(16,185,129,0.1)] backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Temporary Mode
              </div>
            )}
            {isStreamingCurrentChat && (
              <div className="flex gap-1">
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse" />
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-75" />
                <span className="h-1 w-1 rounded-full bg-white/40 animate-pulse delay-150" />
              </div>
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center justify-end gap-4">
          {isTemporaryChatActive && (
            <button
              onClick={handleExitTempChat}
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-rose-500/25 bg-rose-950/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-400 backdrop-blur-md transition-all hover:bg-rose-500/25 hover:text-rose-200 hover:border-rose-500/40 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_12px_rgba(244,63,94,0.08)] cursor-pointer"
              title="Exit"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-rose-500/0 via-rose-500/10 to-rose-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <LogOut size={13} className="transition-transform group-hover:translate-x-0.5 duration-300 relative z-10" />
              <span className="relative z-10 hidden sm:inline">Exit</span>
            </button>
          )}

          {currentChatId && (
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Share chat"
            >
              <Share size={16} />
            </button>
          )}

          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "h-7 w-7",
                userButtonTrigger: "h-8 w-8",
              },
            }}
          />
        </div>
      </div>

      {currentChatId && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          chatId={currentChatId}
        />
      )}
    </header>
  );
};

export default memo(ChatHeader);
