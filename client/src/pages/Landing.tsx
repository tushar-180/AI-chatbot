import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useUser } from "@clerk/react";

const Landing = () => {
  const { isSignedIn } = useUser();

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black font-sans text-white antialiased">
      {/* 1. Subtle Structural Lines (For a "designed" feel) */}
      <div className="absolute inset-0 flex justify-center pointer-events-none">
        <div className="w-px h-full bg-white/3" />
        <div className="w-[800px] h-full border-x border-white/3" />
      </div>

      {/* 2. Minimalist Navbar */}
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between px-12 py-10">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Velora Logo" className="h-6 w-6 object-contain" />
          <span className="font-display text-lg font-bold tracking-tight">
            Velora
            </span>
          </div>
            <Link to={isSignedIn ? "/chat" : "/auth"}>
          <Button variant="ghost" className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 hover:bg-white/5 hover:text-white transition-all">
            {isSignedIn ? "Launch App" : "Sign In"}
              </Button>
            </Link>
      </nav>

      {/* 3. Hand-Crafted Hero Section */}
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center text-center animate-in fade-in duration-1000 ease-out">
          <h1 className="font-display text-7xl font-bold tracking-tighter sm:text-9xl leading-[0.85] text-white">
            Simple. <br />
            Powerful. <br />
            <span className="text-slate-800">Intelligence.</span>
          </h1>
          
          <p className="mx-auto mt-12 max-w-md text-sm md:text-base text-slate-500 font-medium leading-relaxed tracking-tight">
            The minimal AI workspace for developers and creators. <br />
            Built for speed, privacy, and absolute clarity.
          </p>

          <div className="mt-16 flex flex-col items-center gap-6">
            <Link to={isSignedIn ? "/chat" : "/auth"}>
              <Button size="lg" className="h-14 rounded-2xl bg-white px-10 text-xs font-bold uppercase tracking-[0.2em] text-black border border-slate-200 transition-all hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] shadow-sm">
                Get Started
                <ArrowRight className="ml-2 h-3.5 w-3.5 stroke-3" />
              </Button>
            </Link>
            
            <Link to="/auth" className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-700 hover:text-slate-400 transition-colors">
              View Changelog
            </Link>
          </div>
            </div>

        {/* 4. Elegant Status Indicator (Fixed bottom) */}
        <div className="absolute bottom-12 left-12 flex items-center gap-4">
           <div className="h-1 w-1 rounded-full bg-white animate-pulse" />
           <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-800">
             Velora Core v2.4
           </span>
            </div>

        <div className="absolute bottom-12 right-12 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-800">
           Ready for deployment
          </div>
      </main>

      {/* 5. Minimal Grain Overlay (For a "premium paper" feel) */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')]" />
    </div>
  );
};

export default Landing;
