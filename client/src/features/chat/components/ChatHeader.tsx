import { memo } from "react";
import { Menu, Ghost, ChevronLeft, Share2, GitCompare } from "lucide-react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useTemporaryChatStore } from "@/features/chat/store/useTemporaryChatStore";
import { useProjectStore } from "@/features/chat/store/useProjectStore";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ShareModal from "./ShareModal";

interface ChatHeaderProps {
  currentChatId: string | null;
  onMenuClick: () => void;
  chatTitle?: string;
  isCompareMode?: boolean;
  onCompareToggle?: () => void;
}

const ChatHeader = ({
  currentChatId,
  onMenuClick,
  chatTitle,
  isCompareMode = false,
  onCompareToggle,
}: ChatHeaderProps) => {
  const isTemporaryChatActive = useTemporaryChatStore((state) => state.isTemporaryChatActive);
  const chats = useChatStore((state) => state.chats);
  const streamingChatIds = useChatStore((state) => state.streamingChatIds);
  const isNewChat = useChatStore((state) => state.isNewChat);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const navigate = useNavigate();
  const { activeProjectId, projectChats } = useProjectStore();

  const handleToggleTempChat = () => {
    const currentActive = useTemporaryChatStore.getState().isTemporaryChatActive;
    const newActive = !currentActive;

    useTemporaryChatStore.getState().setTemporaryChatActive(newActive);

    if (newActive) {
      useChatStore.getState().setCurrentChat(null);
      useChatStore.getState().setIsNewChat(true);
      useChatStore.getState().setMessages([]);
      useTemporaryChatStore.getState().clearStore();
      useChatStore.getState().setIsStreaming(false);
      useChatStore.getState().setLoading(false);
    } else {
      useTemporaryChatStore.getState().clearStore();
    }
    navigate("/chat");
  };

  const currentChat = chats.find((chat) => chat._id === currentChatId) || projectChats.find((chat) => chat._id === currentChatId);
  chatTitle = chatTitle || currentChat?.title || "New Conversation";
  const isStreamingCurrentChat =
    !!currentChatId && streamingChatIds[currentChatId] === true;

 

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/40 bg-[#09090b] not-selectable">
      <div className="mx-auto flex h-14 items-center justify-between px-6 md:px-8">
        {/* Left Section */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={onMenuClick}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:text-white lg:hidden"
          >
            <Menu size={16} />
          </button>

          {/* Back button — navigates to project dashboard or global new chat */}
          {currentChatId && (
            <button
              onClick={() => {
                if (activeProjectId) {
                  navigate(`/projects/${activeProjectId}`);
                } else {
                  useChatStore.getState().setCurrentChat(null);
                  useChatStore.getState().setMessages([]);
                  useChatStore.getState().setIsNewChat(true);
                  navigate("/chat");
                }
              }}
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
              title={activeProjectId ? "Back to project" : "Back to new chat"}
            >
              <ChevronLeft size={16} />
            </button>
          )}

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
        <div className="flex items-center justify-end gap-3.5">
          {/* Compare Mode Toggle */}
          <button
            onClick={onCompareToggle}
            className={
              isCompareMode
                ? "group relative flex h-8 px-3 items-center justify-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-950/20 text-purple-400 backdrop-blur-md transition hover:bg-purple-500/25 hover:text-purple-200 hover:border-purple-500/40 active:scale-[0.95] shadow-[0_0_12px_rgba(168,85,247,0.15)] cursor-pointer text-xs font-semibold"
                : "group relative flex h-8 px-3 items-center justify-center gap-1.5 rounded-lg border border-zinc-800/40 bg-white/5 text-zinc-400 backdrop-blur-md transition hover:bg-white/10 hover:text-zinc-200 hover:border-zinc-800/60 active:scale-[0.95] cursor-pointer text-xs font-semibold"
            }
            title={isCompareMode ? "Exit Compare Mode" : "Compare Models Side-by-Side"}
          >
            <GitCompare
              size={13}
              className={
                isCompareMode
                  ? "text-purple-400 animate-pulse"
                  : "text-zinc-400 group-hover:text-zinc-200 transition-colors"
              }
            />
            <span>Compare</span>
          </button>

          {/* Temporary Chat Toggle Button */}
          {(isNewChat || !currentChatId || isTemporaryChatActive) && (
            <button
              onClick={handleToggleTempChat}
              className={
                isTemporaryChatActive
                  ? "group relative flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 backdrop-blur-md transition hover:bg-emerald-500/25 hover:text-emerald-200 hover:border-emerald-500/40 active:scale-[0.95] shadow-[0_0_12px_rgba(16,185,129,0.15)] cursor-pointer"
                  : "group relative flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800/40 bg-white/5 text-zinc-400 backdrop-blur-md transition hover:bg-white/10 hover:text-white hover:border-zinc-800/60 active:scale-[0.95] cursor-pointer"
              }
              title={isTemporaryChatActive ? "Exit Temporary Chat" : "Start Temporary Chat"}
            >
              <Ghost
                size={16}
                className={
                  isTemporaryChatActive
                    ? "text-emerald-400 animate-pulse"
                    : "text-zinc-400 group-hover:text-white transition-colors"
                }
              />
            </button>
          )}

          {currentChatId && (
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Share chat"
            >
              <Share2 size={16} />
            </button>
          )}

         
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
