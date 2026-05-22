import { useParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import GroupChatHeader from "@/features/chat/components/GroupChatHeader";
import GroupMessageList from "@/features/chat/components/GroupMessageList";
import GroupInputArea from "@/features/chat/components/GroupInputArea";
import SourcesSidebar from "@/features/chat/components/SourceSidebar";
import { useGroupChat } from "@/features/chat/hooks/useGroupChat";
import { Spotlight } from "@/components/ui/spotlight";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useGroupStore } from "@/features/chat/store/useGroupStore";
import type { WebSource } from "@/features/chat/types/chat.types";

const GroupChat = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { setSidebarOpen, setCurrentChat } = useChatStore();
  const {
    sendMessage,
    stopStream,
    isStreaming,
    typingUsers,
    sendTypingStatus,
    editMessage,
    retryMessage,
    updateMessageFeedback,
  } = useGroupChat();
  const { setCurrentGroup } = useGroupStore();

  // Sources sidebar state
  const [selectedSources, setSelectedSources] = useState<WebSource[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<number | null>(null);

  useEffect(() => {
    if (groupId) {
      setCurrentChat(null); // Deselect private chat when in a group chat
      setCurrentGroup(groupId);
      setSelectedSources([]);
      setActiveSourceId(null);
    }
  }, [groupId, setCurrentChat, setCurrentGroup]);

  const handleSourcesOpen = useCallback(
    (sources: WebSource[], sourceId?: number) => {
      setSelectedSources(sources);
      setActiveSourceId(sourceId ?? sources[0]?.id ?? null);
    },
    [],
  );

  const handleCitationClick = useCallback((id: number) => {
    setActiveSourceId(id);
  }, []);

  const handleSourcesClose = useCallback(() => {
    setSelectedSources([]);
    setActiveSourceId(null);
  }, []);

  return (
    <>
      <main className="relative flex flex-1 flex-col h-screen overflow-hidden bg-linear-to-br from-[#030712] via-[#0f172a]/40 to-[#030712]">
        {/* Spotlight Component - Positioned correctly */}
        <Spotlight
          className="-top-40 left-0 md:-top-20 md:left-60 opacity-60"
          fill="rgba(255, 255, 255, 0.05)"
        />

        <div className="flex-1 overflow-y-auto flex flex-col relative pb-[15vh] mask-[linear-gradient(to_bottom,black_85%,transparent_98%)]">
          <GroupChatHeader
            groupId={groupId!}
            onMenuClick={() => setSidebarOpen(true)}
          />

          <div className="relative flex-1">
            <GroupMessageList
              onCitationClick={handleCitationClick}
              onSourcesClick={handleSourcesOpen}
              onEditMessage={editMessage}
              onRetryMessage={retryMessage}
              onFeedback={updateMessageFeedback}
            />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
          {typingUsers && typingUsers.length > 0 && (
            <div className="mx-auto max-w-4xl px-4 pointer-events-auto mb-2 text-xs text-slate-400 font-medium tracking-wide flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
              <span className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 shadow-sm">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
              </span>
              <span className="text-slate-400 font-semibold tracking-wide">
                {typingUsers.map((u) => u.username).join(", ")}{" "}
                <span className="text-slate-500 font-medium">
                  {typingUsers.length === 1 ? "is" : "are"} typing...
                </span>
              </span>
            </div>
          )}
          <div className="pointer-events-auto">
            <GroupInputArea
              onSubmit={sendMessage}
              isStreaming={isStreaming}
              onStop={stopStream}
              onTyping={sendTypingStatus}
            />
          </div>
        </div>

        {/* Minimal Noise Overlay for Texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')] z-50" />
      </main>

      {selectedSources.length > 0 && (
        <SourcesSidebar
          sources={selectedSources}
          activeId={activeSourceId}
          onSelect={setActiveSourceId}
          onClose={handleSourcesClose}
        />
      )}
    </>
  );
};

export default GroupChat;
