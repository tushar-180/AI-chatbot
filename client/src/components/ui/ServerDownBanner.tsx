import React from "react";
import { RefreshCw, WifiOff } from "lucide-react";

interface ServerDownBannerProps {
  isDown: boolean;
}

const ServerDownBanner: React.FC<ServerDownBannerProps> = ({ isDown }) => {
  if (!isDown) return null;

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black p-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {/* Minimalist Icon */}
        <div className="mb-10 flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40">
          <WifiOff size={40} strokeWidth={1} />
        </div>

        {/* Typography */}
        <h2 className="text-3xl font-light tracking-tight text-white">
          System Offline
        </h2>
        <p className="mt-6 text-sm font-medium leading-relaxed text-zinc-600 max-w-[280px]">
          The connection to our neural core has been severed. Re-initialization is required.
        </p>

        {/* Action */}
        <div className="mt-12 w-full max-w-[240px]">
          <button
            onClick={handleRefresh}
            className="group flex w-full items-center justify-center gap-3 rounded-full border border-white/20 bg-transparent px-6 py-4 text-[10px] font-bold uppercase tracking-[0.3em] text-white transition-all hover:bg-white hover:text-black active:scale-[0.98]"
          >
            <RefreshCw size={14} className="transition-transform duration-700 group-hover:rotate-180" />
            <span>Re-initialize</span>
          </button>
        </div>

        {/* Status indicator */}
        <div className="mt-16 flex flex-col items-center gap-2">
          <div className="h-12 w-[1px] bg-gradient-to-b from-zinc-800 to-transparent" />
          <span className="text-[8px] font-bold uppercase tracking-[0.5em] text-zinc-800">
            Link Status: Terminated
          </span>
        </div>
      </div>
    </div>
  );
};

export default ServerDownBanner;
