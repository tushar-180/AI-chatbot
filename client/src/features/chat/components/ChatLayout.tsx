import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "@/features/chat/components/Sidebar";
import { Suspense, useEffect } from "react";
import Loading from "./Loading";
import { cleanupGroupChatStream } from "../hooks/useGroupChat";
import { cleanupTemporaryChatStream } from "../hooks/useTemporaryChat";

export default function ChatLayout() {
  const location = useLocation();

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
