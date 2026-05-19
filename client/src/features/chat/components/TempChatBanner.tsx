import { ShieldAlert } from "lucide-react";

export const TempChatBanner = () => {
  return (
    <div className="mx-auto my-4 w-[90%] max-w-3xl rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-md shadow-[0_4px_30px_rgba(16,185,129,0.05)] animate-in fade-in slide-in-from-top-3 duration-500">
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          <ShieldAlert size={16} className="animate-pulse" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Temporary Chat Active
          </h4>
          <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
            This conversation is completely stateless. No records, messages, or metadata are stored in MongoDB, local storage, or neural banks. Disabling this mode, refreshing the page, or navigating away will instantly erase all session data.
          </p>
        </div>
      </div>
    </div>
  );
};
