export default function oading() {
  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-black to-slate-950 text-white overflow-hidden">
      
      {/* Glow Background */}
      <div className="absolute w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl"></div>

      {/* Spinner */}
      <div className="w-16 h-16 rounded-full border-4 border-transparent 
                      border-t-cyan-400 border-r-purple-500
                      animate-spin3d shadow-[0_0_20px_#00f0ff,0_0_40px_#8b5cf6,inset_0_0_10px_#00f0ff]">
      </div>

      {/* Text */}
      <p className="mt-6 text-sm tracking-wide opacity-70">
        Starting AI...
      </p>
    </div>
  );
}