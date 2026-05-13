import { memo } from "react";
import { UserButton } from "@clerk/react";
import { Menu, Share } from "lucide-react";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useState } from "react";
import ShareModal from "./ShareModal";

interface ChatHeaderProps {
  currentChatId: string | null;
  onMenuClick: () => void;
}

const ChatHeader = ({ currentChatId, onMenuClick }: ChatHeaderProps) => {
  const chats = useChatStore((state) => state.chats);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const streamingChatId = useChatStore((state) => state.streamingChatId);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const currentChat = chats.find((chat) => chat._id === currentChatId);
  const chatTitle = currentChat?.title || "New Conversation";
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
