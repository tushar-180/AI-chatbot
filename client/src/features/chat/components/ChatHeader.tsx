import { memo } from "react";
import { UserButton, useUser } from "@clerk/react";
import { Sparkles, Menu } from "lucide-react";

interface ChatHeaderProps {
  currentChatId: string | null;
  onMenuClick: () => void;
}

const ChatHeader = ({ currentChatId, onMenuClick }: ChatHeaderProps) => {
  const { user } = useUser();

  return (
    <header className="z-10 border-b border-slate-800/50 bg-linear-to-r from-slate-950 via-slate-900/80 to-slate-950 px-4 md:px-6 py-3 md:py-4 backdrop-blur-2xl shadow-lg shadow-slate-950/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3 w-full">
          {/* Hamburger Menu - Only on Mobile */}
          <button
            onClick={onMenuClick}
            className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-200 md:hidden"
          >
            <Menu size={18} />
          </button>
          
          <div className="hidden sm:flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500/20 to-blue-500/20 text-indigo-400 ring-1 ring-indigo-500/30">
            <Sparkles size={18} />
          </div>
          <div className="flex items-center justify-between w-full">
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-bold tracking-tight text-white flex items-center gap-1 md:gap-2 truncate">
                Code-Bot
                <span className="hidden xs:inline text-indigo-400 text-[10px] md:text-sm font-medium border-l border-slate-700 pl-2 ml-1 truncate">
                  {user?.firstName || user?.username || "Guest"}
                </span>
              </h1>
              <p className="text-[10px] md:text-xs font-medium text-slate-400 truncate">
                {user?.firstName ? `Hello, ${user.firstName}` : "Welcome"} •{" "}
                {currentChatId
                  ? "Active Session"
                  : "New Session"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <UserButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default memo(ChatHeader);
