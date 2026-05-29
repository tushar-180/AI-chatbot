import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "@/features/chat/components/Sidebar";
import { Suspense, useEffect, useRef } from "react";
import Loading from "./Loading";
import { cleanupGroupChatStream } from "../hooks/useGroupChat";
import { cleanupTemporaryChatStream } from "../hooks/useTemporaryChat";
import { api } from "@/lib/api";
import { toast } from "sonner";

const MEMORY_MAX = 100;

export default function ChatLayout() {
  const location = useLocation();
  const memoryCheckedRef = useRef(false);

  // One-time memory capacity check on first page load
  useEffect(() => {
    if (memoryCheckedRef.current) return;
    memoryCheckedRef.current = true;

    api
      .get("/memory", { params: { limit: 1, skip: 0 } })
      .then(({ data }) => {
        const total = data.totalCount ?? 0;
        if (total >= MEMORY_MAX) {
          toast.error("AI Memory Storage is full! Delete some memories to store new ones.", {
            duration: 6000,
            id: "memory-full",
          });
        } else if (total >= 80) {
          toast.warning(
            `AI Memory Storage is ${total}% full. Consider clearing old memories in Settings.`,
            { duration: 5000, id: "memory-warning" }
          );
        }
      })
      .catch(() => {
        // Silently ignore — non-critical check
      });
  }, []);

  useEffect(() => {
    // If the path is not a group chat, clean up any active group chat streams immediately.
    // This catches browser back/forward buttons, manual url entries, or other non-sidebar transitions.
    if (!location.pathname.startsWith("/group/")) {
      cleanupGroupChatStream();
    }
    // If the path is not exactly /chat (e.g., switching to a persistent chat like /chat/:chatId),
    // clean up any active temporary stream immediately.
    if (location.pathname !== "/chat") {
      cleanupTemporaryChatStream();
    }
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased ">
      <Sidebar />
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
