import { useParams } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "@/features/chat/components/Sidebar";
import GroupChatHeader from "@/features/chat/components/GroupChatHeader";
import GroupMessageList from "@/features/chat/components/GroupMessageList";
import GroupInputArea from "@/features/chat/components/GroupInputArea";
import { useGroupChat } from "@/features/chat/hooks/useGroupChat";
import { Spotlight } from "@/components/ui/spotlight";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { useGroupStore } from "@/features/chat/store/useGroupStore";

const GroupChat = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const { setSidebarOpen, setCurrentChat } = useChatStore();
  const { sendMessage, stopStream, isStreaming } = useGroupChat();
  const { setCurrentGroup } = useGroupStore();

  useEffect(() => {
    if (groupId) {
      setCurrentChat(null); // Deselect private chat when in a group chat
      setCurrentGroup(groupId);
    }
  }, [groupId, setCurrentChat, setCurrentGroup]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      <Sidebar />

      <main className="relative flex flex-1 flex-col h-screen overflow-hidden bg-linear-to-br from-[#030712] via-[#0f172a]/40 to-[#030712]">
        {/* Spotlight Component - Positioned correctly */}
        <Spotlight
          className="-top-40 left-0 md:-top-20 md:left-60 opacity-60"
          fill="rgba(255, 255, 255, 0.05)"
        />

        <div className="flex-1 overflow-y-auto scroll-smooth flex flex-col relative pb-[15vh] mask-[linear-gradient(to_bottom,black_85%,transparent_98%)]">
          <GroupChatHeader
            groupId={groupId!}
            onMenuClick={() => setSidebarOpen(true)}
          />

          <div className="relative flex-1">
            <GroupMessageList />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
          <div className="pointer-events-auto">
            <GroupInputArea onSubmit={sendMessage} isStreaming={isStreaming} onStop={stopStream} />
          </div>
        </div>

        {/* Minimal Noise Overlay for Texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')] z-50" />
      </main>
    </div>
  );
};

export default GroupChat;
