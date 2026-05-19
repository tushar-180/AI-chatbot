import { Outlet } from "react-router-dom";
import Sidebar from "@/features/chat/components/Sidebar";

export default function ChatLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
      <Sidebar />
      <Outlet />
    </div>
  );
}
