export default function Loading() {
  return (
    <div className="relative flex flex-col items-center justify-center h-screen 
                    bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#1e1b4b] 
                    text-white overflow-hidden">

      {/* Violet Glow Background */}
      <div className="absolute w-72 h-72 bg-purple-500/20 rounded-full blur-3xl"></div>

      {/* Spinner */}
      <div className="w-16 h-16 rounded-full border-4 border-transparent 
                      border-t-blue-500 border-r-purple-500
                      animate-spin shadow-[0_0_20px_rgba(59,130,246,0.7),0_0_40px_rgba(168,85,247,0.6)]">
      </div>

      {/* Text */}
      <p className="mt-6 text-sm tracking-wide opacity-70">
        Starting AI...
      </p>
    </div>
  );
}