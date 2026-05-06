import { SignIn } from "@clerk/react";
import { Link } from "react-router-dom";

const Auth = () => {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white font-sans antialiased overflow-hidden">
      {/* 1. Structural Lines (Matching Landing) */}
      <div className="absolute inset-0 flex justify-center pointer-events-none">
        <div className="w-px h-full bg-white/3" />
        <div className="w-[800px] h-full border-x border-white/3" />
      </div>

      {/* 2. Top Branding */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-3 group">
          <img src="/logo.png" alt="Velora Logo" className="h-6 w-6 object-contain" />
          <span className="font-display text-lg font-bold tracking-tight">
            Velora
          </span>
        </Link>
      </div>

      {/* 3. Auth Container */}
      <div className="relative z-10 w-full max-w-md px-6 animate-in fade-in duration-1000">
        <div className="mb-12 text-center space-y-4">
           <h1 className="font-display text-4xl font-bold tracking-tighter">Welcome.</h1>
           <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.4em]">Encrypted Access Portal</p>
        </div>
        
        <div className="rounded-3xl border border-white/5 bg-white/1 p-1 shadow-2xl backdrop-blur-sm">
          <SignIn 
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "bg-transparent border-none shadow-none p-4",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton: "bg-white/5 border border-white/5 hover:bg-white/10 text-white transition-all rounded-2xl h-12",
                socialButtonsBlockButtonText: "text-white font-bold text-[10px] uppercase tracking-widest",
                formButtonPrimary: "bg-white text-black hover:bg-slate-100 transition-all rounded-2xl h-12 text-[10px] font-bold uppercase tracking-widest border border-slate-200 shadow-xl",
                formFieldLabel: "text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2",
                formFieldInput: "bg-white/5 border border-white/5 text-white rounded-2xl h-12 px-4 focus:ring-1 focus:ring-white/20 transition-all",
                footerActionText: "text-slate-500 text-[10px] font-bold",
                footerActionLink: "text-white hover:text-slate-300 transition-colors text-[10px] font-bold underline underline-offset-4",
                identityPreviewText: "text-white",
                identityPreviewEditButton: "text-slate-400",
                dividerLine: "bg-white/5",
                dividerText: "text-slate-700 text-[8px] font-bold uppercase tracking-widest",
              }
            }}
          />
        </div>
      </div>

      {/* 4. Bottom Navigation */}
      <div className="absolute bottom-12 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-800">
        <Link to="/" className="hover:text-slate-500 transition-colors">Return to terminal</Link>
      </div>

      {/* 5. Minimal Grain Overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')]" />
    </div>
  );
};

export default Auth;
