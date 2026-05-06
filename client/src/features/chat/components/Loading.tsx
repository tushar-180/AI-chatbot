export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-black">
      <div className="relative flex flex-col items-center gap-6">
        {/* Minimal structural line */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-px h-12 bg-linear-to-b from-transparent to-indigo-500/50" />
        
        {/* Minimal dot animation */}
        <div className="flex gap-2.5">
          <div className="h-1 w-1 rounded-full bg-indigo-500 animate-pulse animation-duration-[1s]" />
          <div className="h-1 w-1 rounded-full bg-indigo-500 animate-pulse animation-duration-[1s] [animation-delay:0.2s]" />
          <div className="h-1 w-1 rounded-full bg-indigo-500 animate-pulse animation-duration-[1s] [animation-delay:0.4s]" />
        </div>
        
        <p className="text-[9px] font-bold tracking-[0.5em] text-slate-700 uppercase animate-in fade-in duration-1000">
          Starting AI
        </p>

        {/* Minimal structural line */}
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-px h-12 bg-linear-to-t from-transparent to-indigo-500/50" />
      </div>
    </div>
  );
}