import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useUser } from "@clerk/react";
import { useEffect, useRef, useState } from "react";

// ─── Minimal scroll-reveal hook ─────────────────────────────────
const useReveal = (threshold = 0.1) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.unobserve(e.target);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
};

// ═══════════════════════════════════════════════════════════════
// LANDING
// ═══════════════════════════════════════════════════════════════
const Landing = () => {
  const { isSignedIn } = useUser();
  const productRef = useReveal(0.1);
  const featuresRef = useReveal(0.08);
  const ctaRef = useReveal(0.15);

  const ctaLink = isSignedIn ? "/chat" : "/auth";

  return (
    <div className="relative min-h-screen w-full bg-[#09090b] text-zinc-100 font-sans antialiased overflow-x-hidden">
      {/* Single, subtle top ambient */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[380px] bg-gradient-to-b from-white/[0.02] to-transparent rounded-full blur-[80px]" />

      {/* ═══ NAVBAR ═══ */}
      <nav className="fixed top-0 z-50 w-full px-6 md:px-10 py-4 backdrop-blur-md bg-[#09090b]/80 border-b border-zinc-800/40">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Velora"
              className="h-6 w-6 object-contain"
            />
            <span className="font-display text-[15px] font-semibold tracking-tight">
              Velora
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="hidden md:block text-[13px] text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Features
            </a>
            <Link to={ctaLink}>
              <Button className="h-8 rounded-lg bg-zinc-100 px-4 text-[13px] font-medium text-zinc-900 hover:bg-white transition-all cursor-pointer">
                {isSignedIn ? "Open App" : "Get Started"}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-20">
        <div className="text-center max-w-3xl mx-auto">
          {/* Version pill */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 text-[12px] text-zinc-500 mb-10 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0s" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
            v2.4 — Now with adaptive memory
          </div>

          {/* Brand name */}
          <div
            className="opacity-0 animate-fade-in-up mb-6"
            style={{ animationDelay: "0.08s" }}
          >
            <h1 className="font-display text-7xl sm:text-8xl md:text-[10rem] font-black tracking-[-0.05em] leading-[0.85] text-zinc-50 selection:bg-zinc-700">
              Velora
            </h1>
            <div className="mx-auto mt-4 h-px w-16 bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
          </div>

          {/* Tagline */}
          <p
            className="font-display text-xl sm:text-2xl md:text-3xl font-semibold tracking-[-0.02em] text-zinc-500 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0.16s" }}
          >
            One workspace. Every AI.
          </p>

          {/* Sub */}
          <p
            className="mt-7 text-[15px] md:text-[17px] text-zinc-500 max-w-md mx-auto leading-relaxed opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0.26s" }}
          >
            GPT‑4, Gemini, Claude, and more — unified in a single,
            beautiful interface built for speed and clarity.
          </p>

          {/* CTAs */}
          <div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0.32s" }}
          >
            <Link to={ctaLink}>
              <Button className="h-11 rounded-xl bg-zinc-100 px-8 text-[14px] font-semibold text-zinc-900 hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.04)]">
                Start building
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a
              href="#product"
              className="h-11 inline-flex items-center px-5 text-[14px] font-medium text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              See how it works
            </a>
          </div>

          {/* Model pills */}
          <div
            className="mt-16 flex flex-wrap items-center justify-center gap-2 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0.45s" }}
          >
            {["Gemini", "GPT-4", "Claude", "Mistral", "DeepSeek"].map((m) => (
              <span
                key={m}
                className="px-3 py-1 rounded-md text-[12px] font-medium text-zinc-600 border border-zinc-800/60 bg-zinc-900/40 hover:text-zinc-400 hover:border-zinc-700 transition-colors"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRODUCT PREVIEW ═══ */}
      <section id="product" ref={productRef.ref} className="relative px-6 py-20 md:py-28">
        <div
          className={`mx-auto max-w-3xl transition-all duration-1000 ease-out ${
            productRef.visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden shadow-2xl shadow-black/50">
            {/* Chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/60">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
              </div>
              <div className="flex-1 flex justify-center">
                <span className="text-[11px] text-zinc-600 font-mono tracking-wide">
                  velora.ai/chat
                </span>
              </div>
              <div className="w-12" />
            </div>

            {/* Chat */}
            <div className="p-6 md:p-10 space-y-5 min-h-[260px]">
              {/* User */}
              <div className="flex justify-end">
                <div className="px-4 py-2.5 rounded-2xl rounded-br-md bg-zinc-800 text-[14px] text-zinc-200 max-w-[240px] md:max-w-sm leading-relaxed">
                  Explain quantum computing simply
                </div>
              </div>

              {/* AI */}
              <div className="flex gap-3 items-start">
                <div className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <img
                    src="/logo.png"
                    alt=""
                    className="h-3.5 w-3.5 object-contain opacity-60"
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <div className="px-4 py-2.5 rounded-2xl rounded-tl-md bg-zinc-800/40 border border-zinc-800/60 text-[14px] text-zinc-400 leading-relaxed max-w-[260px] md:max-w-lg">
                    Think of a regular computer as reading one book at a time. A
                    quantum computer reads{" "}
                    <span className="text-zinc-200 font-medium">
                      every book simultaneously
                    </span>
                    . It uses qubits that exist as both 0 and 1, solving complex
                    problems exponentially faster.
                  </div>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[11px] text-zinc-600">
                      Gemini 2.5 Pro
                    </span>
                    <span className="text-zinc-800">·</span>
                    <span className="text-[11px] text-zinc-600">0.8s</span>
                  </div>
                </div>
              </div>

              {/* Typing */}
              <div className="flex gap-3 items-end">
                <div className="h-7 w-7 rounded-lg bg-zinc-800/60 flex items-center justify-center flex-shrink-0">
                  <img
                    src="/logo.png"
                    alt=""
                    className="h-3.5 w-3.5 object-contain opacity-30"
                  />
                </div>
                <div className="flex gap-1 px-4 py-3 rounded-2xl rounded-tl-md bg-zinc-800/25 border border-zinc-800/40">
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section
        id="features"
        ref={featuresRef.ref}
        className="relative px-6 py-24 md:py-32"
      >
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div
            className={`mb-14 md:mb-16 transition-all duration-1000 ease-out ${
              featuresRef.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600 mb-3">
              Features
            </p>
            <h2 className="font-display text-3xl md:text-[2.8rem] font-bold tracking-[-0.03em] text-zinc-100 leading-[1.15]">
              Built for the way
              <br />
              you actually work.
            </h2>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-zinc-800/30 rounded-2xl overflow-hidden border border-zinc-800/50">
            {[
              {
                n: "01",
                title: "Multi-model",
                desc: "Switch between GPT-4, Gemini, Claude, and more. One interface, every model.",
              },
              {
                n: "02",
                title: "Streaming",
                desc: "Real-time responses via SSE. Watch intelligence unfold as it's generated.",
              },
              {
                n: "03",
                title: "Projects",
                desc: "Organize chats into workspaces. Persistent context across conversations.",
              },
              {
                n: "04",
                title: "Collaboration",
                desc: "Real-time group AI sessions. Think and build together with your team.",
              },
              {
                n: "05",
                title: "Memory",
                desc: "Velora learns your patterns and preferences. Every session gets smarter.",
              },
              {
                n: "06",
                title: "Privacy",
                desc: "Your data stays yours. Encrypted conversations with enterprise-grade security.",
              },
            ].map((f, i) => (
              <div
                key={f.n}
                className={`bg-[#09090b] p-7 md:p-9 group hover:bg-zinc-900/40 transition-all duration-700 ease-out ${
                  featuresRef.visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${180 + i * 70}ms` }}
              >
                <span className="text-[11px] font-mono text-zinc-700 group-hover:text-zinc-500 transition-colors mb-4 block">
                  {f.n}
                </span>
                <h3 className="font-display text-[17px] font-semibold text-zinc-200 mb-2 tracking-tight">
                  {f.title}
                </h3>
                <p className="text-[14px] text-zinc-500 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section className="relative px-6 py-14">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-y-6 py-8 border-y border-zinc-800/50">
            {[
              { value: "10+", label: "AI models" },
              { value: "<500ms", label: "Avg response" },
              { value: "99.9%", label: "Uptime" },
              { value: "∞", label: "Conversations" },
            ].map((s) => (
              <div key={s.label} className="text-center flex-1 min-w-[110px]">
                <div className="font-display text-2xl md:text-3xl font-bold text-zinc-100 tracking-tight">
                  {s.value}
                </div>
                <div className="text-[12px] text-zinc-600 mt-1.5">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section ref={ctaRef.ref} className="relative px-6 py-28 md:py-36">
        <div
          className={`mx-auto max-w-2xl text-center transition-all duration-1000 ease-out ${
            ctaRef.visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <h2 className="font-display text-4xl md:text-[3.5rem] font-bold tracking-[-0.035em] text-zinc-100 leading-[1.1]">
            Ready to build?
          </h2>
          <p className="mt-5 text-[16px] text-zinc-500 max-w-sm mx-auto leading-relaxed">
            Start using Velora today. No credit card, no setup, no friction.
          </p>
          <div className="mt-8">
            <Link to={ctaLink}>
              <Button className="h-12 rounded-xl bg-zinc-100 px-10 text-[14px] font-semibold text-zinc-900 hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-[0_0_30px_rgba(255,255,255,0.04)]">
                {isSignedIn ? "Open workspace" : "Get started free"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt=""
              className="h-4 w-4 object-contain opacity-30"
            />
            <span className="text-[12px] text-zinc-600">
              © {new Date().getFullYear()} Velora
            </span>
          </div>
          <div className="flex items-center gap-5">
            <span className="text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer">
              Privacy
            </span>
            <span className="text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer">
              Terms
            </span>
            <span className="text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer">
              Docs
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
