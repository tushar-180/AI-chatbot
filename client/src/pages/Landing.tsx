import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useUser } from "@clerk/react";
import { Spotlight } from "@/components/ui/spotlight";

const Landing = () => {
  const { isSignedIn } = useUser();

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 font-sans text-white antialiased">
      {/* 1. Spotlight Effect */}
      <Spotlight
        className="-top-40 left-0 md:-top-20 md:left-60 opacity-50 pointer-events-none"
        fill="rgba(99, 102, 241, 0.07)"
      />

      {/* 2. Glassmorphic Ambient Floating Glows */}
      <div className="absolute top-1/6 left-1/4 -z-10 h-[380px] w-[380px] rounded-full bg-indigo-500/8 blur-[110px] animate-float-blob pointer-events-none" />
      <div className="absolute bottom-1/5 right-1/4 -z-10 h-[420px] w-[420px] rounded-full bg-emerald-500/6 blur-[130px] animate-float-blob-reverse pointer-events-none" />

      {/* 3. Subtle Structural Lines (Animate drawing themselves in) */}
      <div className="absolute inset-0 flex justify-center pointer-events-none overflow-hidden">
        <div className="w-px h-full bg-white/[0.02] animate-draw-line" style={{ animationDelay: "0.1s" }} />
        <div className="w-[800px] h-full border-x border-white/[0.02] relative">
          {/* Horizontal cross lines */}
          <div className="absolute top-1/4 left-0 w-full h-px bg-white/[0.02] animate-draw-line-horiz" style={{ animationDelay: "0.3s" }} />
          <div className="absolute top-2/4 left-0 w-full h-px bg-white/[0.02] animate-draw-line-horiz" style={{ animationDelay: "0.5s" }} />
          <div className="absolute top-3/4 left-0 w-full h-px bg-white/[0.02] animate-draw-line-horiz" style={{ animationDelay: "0.7s" }} />
        </div>
      </div>

      {/* 4. Minimalist Navbar */}
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between px-12 py-10">
        <div className="flex items-center gap-3 animate-in fade-in duration-700 ease-out">
          <img src="/logo.png" alt="Velora Logo" className="h-6 w-6 object-contain" />
          <span className="font-display text-lg font-bold tracking-tight">
            Velora
          </span>
        </div>
        <Link to={isSignedIn ? "/chat" : "/auth"} className="animate-in fade-in duration-700 ease-out">
          <Button variant="ghost" className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 hover:bg-white/5 hover:text-white transition-all cursor-pointer">
            {isSignedIn ? "Launch App" : "Sign In"}
          </Button>
        </Link>
      </nav>

      {/* 5. Hero Section */}
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center text-center">
          <h1 className="font-display text-7xl font-bold tracking-tighter sm:text-9xl leading-[0.9] text-white">
            <span className="block opacity-0 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              Simple.
            </span>
            <span className="block opacity-0 animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
              Powerful.
            </span>
            <span className="block opacity-0 animate-fade-in-up" style={{ animationDelay: "0.6s" }}>
              <span className="bg-gradient-to-r from-indigo-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent animate-text-gradient font-black">
                Intelligence.
              </span>
            </span>
          </h1>
          
          <p className="mx-auto mt-12 max-w-md text-sm md:text-base text-slate-500 font-medium leading-relaxed tracking-tight opacity-0 animate-fade-in-up" style={{ animationDelay: "0.8s" }}>
            The minimal AI workspace for developers and creators. <br />
            Built for speed, privacy, and absolute clarity.
          </p>

          <div className="mt-16 flex flex-col items-center gap-6 opacity-0 animate-fade-in-up" style={{ animationDelay: "1.0s" }}>
            <Link to={isSignedIn ? "/chat" : "/auth"}>
              <Button size="lg" className="h-14 rounded-2xl bg-white px-10 text-xs font-bold uppercase tracking-[0.2em] text-black border border-slate-200 transition-all hover:bg-slate-100 hover:scale-[1.04] hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] active:scale-[0.98] shadow-sm cursor-pointer">
                Get Started
                <ArrowRight className="ml-2 h-3.5 w-3.5 stroke-3 animate-pulse" />
              </Button>
            </Link>
            
            <Link to="/auth" className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-700 hover:text-slate-400 transition-colors">
              View Changelog
            </Link>
          </div>
        </div>

        {/* 6. Elegant Status Indicator (Fixed bottom) */}
        <div className="absolute bottom-12 left-12 flex items-center gap-4 opacity-0 animate-fade-in-up" style={{ animationDelay: "1.2s" }}>
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-700">
            Velora Core v2.4
          </span>
        </div>

        <div className="absolute bottom-12 right-12 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-700 opacity-0 animate-fade-in-up" style={{ animationDelay: "1.2s" }}>
          Ready for deployment
        </div>
      </main>

      {/* 7. Minimal Grain Overlay (For a "premium paper" feel) */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')]" />
    </div>
  );
};

export default Landing;
