import { SignIn } from "@clerk/react";
import { Link } from "react-router-dom";

const Auth = () => {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-[#09090b] text-zinc-100 font-sans antialiased overflow-hidden">
      {/* Subtle top ambient */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-white/[0.015] to-transparent rounded-full blur-[80px]" />

      {/* Top Branding */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 flex items-center gap-2.5">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img src="/logo.png" alt="Velora Logo" className="h-6 w-6 object-contain" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-zinc-100">
            Velora
          </span>
        </Link>
      </div>

      {/* Auth Container */}
      <div className="relative z-10 w-full max-w-md px-6 animate-in fade-in duration-700">
        <div className="mb-10 text-center space-y-3">
           <h1 className="font-display text-3xl font-bold tracking-tight text-zinc-50">Welcome back</h1>
           <p className="text-[13px] text-zinc-500">Sign in to continue to your workspace</p>
        </div>
        
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-1 shadow-2xl shadow-black/40">
          <SignIn 
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "bg-transparent border-none shadow-none p-4",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton: "bg-zinc-800/60 border border-zinc-700/40 hover:bg-zinc-800 text-zinc-200 transition-all rounded-xl h-11",
                socialButtonsBlockButtonText: "text-zinc-200 font-semibold text-[13px]",
                formButtonPrimary: "bg-zinc-100 text-zinc-900 hover:bg-white transition-all rounded-xl h-11 text-[13px] font-semibold border-0 shadow-[0_0_20px_rgba(255,255,255,0.04)]",
                formFieldLabel: "text-zinc-500 text-[12px] font-medium mb-1.5",
                formFieldInput: "bg-zinc-800/40 border border-zinc-700/40 text-zinc-100 rounded-xl h-11 px-4 focus:ring-1 focus:ring-zinc-600 focus:border-zinc-600 transition-all placeholder:text-zinc-600",
                footerActionText: "text-zinc-500 text-[12px]",
                footerActionLink: "text-zinc-200 hover:text-white transition-colors text-[12px] font-medium underline underline-offset-4",
                identityPreviewText: "text-zinc-200",
                identityPreviewEditButton: "text-zinc-400",
                dividerLine: "bg-zinc-800/60",
                dividerText: "text-zinc-600 text-[11px] font-medium",
              }
            }}
          />
        </div>
      </div>

      {/* Bottom link */}
      <div className="absolute bottom-10 text-[12px] font-medium text-zinc-600 hover:text-zinc-400 transition-colors">
        <Link to="/">← Return home</Link>
      </div>
    </div>
  );
};

export default Auth;
