import * as React from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowUp, 
  Code, 
  Cpu, 
  Globe, 
  History, 
  Layers, 
  MessageSquare, 
  Lightbulb, 
  Terminal, 
  Share2, 
  Check,
  Menu,
  X,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@clerk/react";

const Landing = () => {
  const { isSignedIn } = useUser();
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 }
  };

  const stagger = {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0b0c] text-white selection:bg-purple-500/30">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/20 blur-[120px]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')] opacity-[0.03] mix-blend-overlay" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      {/* Navbar */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? "bg-black/60 backdrop-blur-xl border-b border-white/10 py-3" : "bg-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
              <img src="/logo.png" alt="Velora Logo" className="w-5 h-5 object-contain" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              Velora AI
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {["Features", "Pricing", "Docs"].map((link) => (
              <a 
                key={link} 
                href={`#${link.toLowerCase()}`} 
                className="text-sm font-medium text-white/60 hover:text-white transition-colors"
              >
                {link}
              </a>
            ))}
            <a href="https://github.com" className="text-white/60 hover:text-white transition-colors">
              <Terminal className="w-5 h-5" />
            </a>
          </nav>

          <div className="flex items-center gap-4">
            <Link to={isSignedIn ? "/chat" : "/auth"}>
              <Button 
                variant="ghost" 
                className="hidden md:flex text-white/70 hover:text-white hover:bg-white/5"
              >
                {isSignedIn ? "Launch App" : "Log In"}
              </Button>
            </Link>
            <Link to={isSignedIn ? "/chat" : "/auth"}>
              <Button className="bg-white text-black hover:bg-white/90 rounded-full px-6 font-semibold transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                Get Started
              </Button>
            </Link>
            <button 
              className="md:hidden text-white"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center gap-8 md:hidden"
          >
            {["Features", "Pricing", "Docs"].map((link) => (
              <a 
                key={link} 
                href={`#${link.toLowerCase()}`} 
                className="text-2xl font-bold"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link}
              </a>
            ))}
            <Link to={isSignedIn ? "/chat" : "/auth"} onClick={() => setIsMobileMenuOpen(false)}>
              <Button className="bg-white text-black rounded-full px-8 py-6 text-lg font-bold">
                Get Started
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-32 pb-20 md:pt-48 md:pb-32 px-6">
          <div className="container mx-auto text-center max-w-5xl">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="outline" className="mb-6 py-1.5 px-4 rounded-full bg-purple-500/10 border-purple-500/20 text-purple-400 font-medium tracking-wide animate-pulse">
                ✨ Introducing Velora v2.4
              </Badge>
            </motion.div>
            
            <motion.h1 
              className="text-5xl md:text-8xl font-black tracking-tighter leading-[1.1] mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              Your AI Copilot <br className="hidden md:block" /> for Everything
            </motion.h1>

            <motion.p 
              className="text-lg md:text-xl text-white/60 mb-12 max-w-2xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
            >
              Access the world's most powerful AI models in one place. GPT-4, Claude 3, and Gemini 1.5 Pro, integrated into your ultimate productivity workspace.
            </motion.p>

            <motion.div 
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
            >
              <Link to={isSignedIn ? "/chat" : "/auth"}>
                <Button size="lg" className="h-14 px-8 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-lg group transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(168,85,247,0.35)] border-0">
                  Start Chatting Free
                  <ArrowUp className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-14 px-8 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-lg transition-all">
                View Demo
              </Button>
            </motion.div>

            {/* Hero Mockup */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.8 }}
              className="relative mx-auto max-w-4xl"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-purple-500/20 to-transparent blur-[100px] -z-10" />
              <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-3xl p-2 shadow-2xl overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="rounded-xl border border-white/5 bg-[#0a0b0c] overflow-hidden aspect-[16/10] flex flex-col">
                  {/* Mockup Header */}
                  <div className="h-12 border-b border-white/5 bg-white/2 flex items-center px-4 justify-between">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/20" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                      <div className="w-3 h-3 rounded-full bg-green-500/20" />
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold">Velora Intelligence Dashboard</div>
                    <div className="w-12" />
                  </div>
                  {/* Mockup Content */}
                  <div className="flex-1 p-6 flex flex-col gap-6 text-left">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
                      <div className="bg-white/5 rounded-2xl p-4 max-w-[80%] text-sm text-white/80">
                        Can you help me design a modern landing page for my new AI SaaS project? I want it to look futuristic and premium.
                      </div>
                    </div>
                    <div className="flex gap-4 self-end flex-row-reverse">
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                        <img src="/logo.png" alt="Velora AI" className="w-4 h-4 object-contain" />
                      </div>
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 max-w-[80%] text-sm text-white/90">
                        Absolutely! For a premium AI aesthetic, I recommend:
                        <ul className="mt-2 list-disc list-inside space-y-1 text-white/70">
                          <li>Dark theme with deep charcoal backgrounds</li>
                          <li>Subtle glowing gradients and glassmorphism</li>
                          <li>Clean, bold typography (Inter or Satoshi)</li>
                          <li>Smooth micro-animations using Framer Motion</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="py-20 border-y border-white/5 bg-white/[0.01]">
          <div className="container mx-auto px-6 text-center">
            <p className="text-white/40 uppercase tracking-[0.3em] text-[10px] font-bold mb-12">Trusted by 50,000+ developers worldwide</p>
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-20 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
               <div className="flex items-center gap-2 font-bold text-xl"><Globe className="w-6 h-6" /> GLOBALTECH</div>
               <div className="flex items-center gap-2 font-bold text-xl"><Cpu className="w-6 h-6" /> NEURAL.IO</div>
               <div className="flex items-center gap-2 font-bold text-xl"><Layers className="w-6 h-6" /> STACKED</div>
               <div className="flex items-center gap-2 font-bold text-xl"><Lightbulb className="w-6 h-6" /> VELOCITY</div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-32 px-6">
          <div className="container mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Designed for the next generation of building</h2>
              <p className="text-white/60 text-lg">Every feature you need to ship faster and smarter, powered by state-of-the-art neural networks.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: "Multi-Model Intelligence",
                  description: "Switch between GPT-4o, Claude 3.5, and Gemini 1.5 Pro instantly for any task.",
                  icon: <Layers className="w-6 h-6 text-purple-400" />
                },
                {
                  title: "Lightning Fast Response",
                  description: "Optimized streaming protocols ensure minimal latency, even for complex reasoning.",
                  icon: <Lightbulb className="w-6 h-6 text-blue-400" />
                },
                {
                  title: "Smart Chat History",
                  description: "Search, organize, and revisit every conversation with our advanced indexing.",
                  icon: <History className="w-6 h-6 text-green-400" />
                },
                {
                  title: "Custom AI Tools",
                  description: "Create and share custom agents specialized in your unique workflow and data.",
                  icon: <img src="/logo.png" className="w-6 h-6 object-contain" />
                },
                {
                  title: "Neural Code Gen",
                  description: "Production-ready code snippets with integrated linting and documentation.",
                  icon: <Code className="w-6 h-6 text-orange-400" />
                },
                {
                  title: "End-to-End Privacy",
                  description: "Your data is encrypted at rest and in transit. We never train on your private data.",
                  icon: <Globe className="w-6 h-6 text-cyan-400" />
                }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className="bg-white/5 border-white/10 hover:bg-white/[0.08] hover:border-purple-500/50 transition-all duration-300 group h-full">
                    <CardHeader>
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                        {feature.icon}
                      </div>
                      <CardTitle className="text-xl text-white">{feature.title}</CardTitle>
                      <CardDescription className="text-white/50 leading-relaxed pt-2">
                        {feature.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive Demo Section */}
        <section className="py-32 px-6 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent">
          <div className="container mx-auto">
            <div className="flex flex-col lg:flex-row items-center gap-16">
              <div className="flex-1 text-left">
                <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20">Interactive Experience</Badge>
                <h2 className="text-3xl md:text-5xl font-bold mb-8 leading-tight">See intelligence in motion</h2>
                <div className="space-y-6">
                  {[
                    "Natural language understanding",
                    "Real-time code generation",
                    "Context-aware reasoning"
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Check className="w-4 h-4" />
                      </div>
                      <p className="text-white/80 font-medium">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 w-full max-w-2xl">
                 <Card className="bg-black border-white/10 overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.1)]">
                   <div className="p-4 border-b border-white/10 flex items-center gap-3">
                     <div className="w-3 h-3 rounded-full bg-white/20" />
                     <div className="text-xs font-bold uppercase tracking-widest text-white/40">Demo Conversation</div>
                   </div>
                   <div className="p-6 h-[400px] flex flex-col gap-6 overflow-y-auto">
                      <div className="flex gap-4">
                        <Avatar className="w-8 h-8 border border-white/10">
                          <AvatarFallback className="bg-white/5 text-[10px]">YOU</AvatarFallback>
                        </Avatar>
                        <div className="bg-white/5 rounded-2xl p-4 text-sm text-white/80">
                          How do I optimize a React component for performance?
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <Avatar className="w-8 h-8 border border-purple-500/20">
                          <AvatarFallback className="bg-purple-500/20 text-purple-400 text-[10px]">AI</AvatarFallback>
                        </Avatar>
                        <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 text-sm text-white/90">
                          <p className="mb-2">To optimize React components, you should focus on three main areas:</p>
                          <ul className="space-y-2 opacity-80">
                            <li>1. <strong>Memoization:</strong> Use `React.memo` and `useMemo` for heavy computations.</li>
                            <li>2. <strong>Virtualization:</strong> For large lists, use tools like `react-window`.</li>
                            <li>3. <strong>State Management:</strong> Keep state as local as possible to avoid re-renders.</li>
                          </ul>
                          <div className="mt-4 flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" />
                             <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce [animation-delay:0.2s]" />
                             <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce [animation-delay:0.4s]" />
                          </div>
                        </div>
                      </div>
                   </div>
                   <div className="p-4 border-t border-white/10">
                      <div className="relative">
                        <Input 
                          placeholder="Type your question..." 
                          className="bg-white/5 border-white/10 rounded-xl pr-10 focus-visible:ring-purple-500"
                        />
                        <Button size="icon" variant="ghost" className="absolute right-1 top-1 h-7 w-7 text-white/40">
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                      </div>
                   </div>
                 </Card>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-32 px-6">
          <div className="container mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Simple 3-step workflow</h2>
              <p className="text-white/60">From complex queries to intelligent answers in seconds.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
               <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
               {[
                 { step: "01", title: "Select Model", desc: "Choose the AI engine that best fits your specific problem." },
                 { step: "02", title: "Ask Anything", desc: "Input text, upload images, or paste code for the AI to analyze." },
                 { step: "03", title: "Get Results", desc: "Receive highly accurate, context-aware responses instantly." }
               ].map((item, i) => (
                 <div key={i} className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-[#0a0b0c] border-2 border-purple-500 flex items-center justify-center text-2xl font-black text-purple-500 mb-8 shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                      {item.step}
                    </div>
                    <h3 className="text-2xl font-bold mb-4">{item.title}</h3>
                    <p className="text-white/50 max-w-xs leading-relaxed">{item.desc}</p>
                 </div>
               ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-32 px-6">
          <div className="container mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Flexible plans for everyone</h2>
              <p className="text-white/60">Choose the intelligence level that matches your needs.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              <Card className="bg-white/5 border-white/10 flex flex-col">
                <CardHeader>
                  <CardTitle>Free</CardTitle>
                  <CardDescription>Perfect for exploring</CardDescription>
                  <div className="mt-4 flex items-baseline">
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-white/40 ml-1">/mo</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-4 mb-8">
                    {["GPT-4o mini access", "50 messages per day", "Basic chat history", "Standard support"].map((feat, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-white/70">
                        <Check className="w-4 h-4 text-green-500" /> {feat}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full bg-white/5 hover:bg-white/10 border-white/10 text-white rounded-xl py-6 font-bold transition-all">
                    Start Free
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-purple-500 relative flex flex-col scale-105 shadow-[0_0_40px_rgba(168,85,247,0.2)]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-purple-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                  Most Popular
                </div>
                <CardHeader>
                  <CardTitle>Pro</CardTitle>
                  <CardDescription>For power users & builders</CardDescription>
                  <div className="mt-4 flex items-baseline">
                    <span className="text-4xl font-bold">$20</span>
                    <span className="text-white/40 ml-1">/mo</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-4 mb-8">
                    {[
                      "GPT-4o & Claude 3.5 Sonnet",
                      "Unlimited messages",
                      "Priority model access",
                      "Full project workspace",
                      "Premium support"
                    ].map((feat, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-white/90">
                        <Check className="w-4 h-4 text-purple-500" /> {feat}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full bg-purple-500 hover:bg-purple-600 text-white rounded-xl py-6 font-bold transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                    Go Pro
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10 flex flex-col">
                <CardHeader>
                  <CardTitle>Team</CardTitle>
                  <CardDescription>For growing organizations</CardDescription>
                  <div className="mt-4 flex items-baseline">
                    <span className="text-4xl font-bold">$49</span>
                    <span className="text-white/40 ml-1">/mo</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-4 mb-8">
                    {["Everything in Pro", "Shared team workspaces", "Admin dashboard", "SOC2 compliance", "Dedicated manager"].map((feat, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-white/70">
                        <Check className="w-4 h-4 text-blue-500" /> {feat}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full bg-white/5 hover:bg-white/10 border-white/10 text-white rounded-xl py-6 font-bold transition-all">
                    Contact Sales
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-32 px-6 bg-white/[0.01]">
          <div className="container mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold mb-20 text-center">Loved by innovators</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { name: "Sarah Chen", role: "Software Engineer", quote: "Velora has completely replaced my search engine. The ability to switch between models for debugging is a game changer." },
                { name: "Marc Aubert", role: "Product Designer", quote: "The interface is beautiful and the speed is unmatched. It feels like a premium tool built by people who actually care about UX." },
                { name: "Elena Rossi", role: "AI Researcher", quote: "Finally, a chat interface that doesn't feel cluttered. It's clean, minimal, and gets the job done faster than anything else." }
              ].map((t, i) => (
                <Card key={i} className="bg-white/5 border-white/10 p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar>
                      <AvatarFallback className="bg-white/10 text-white/60">{t.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-bold">{t.name}</div>
                      <div className="text-xs text-white/40">{t.role}</div>
                    </div>
                  </div>
                  <p className="text-white/70 italic leading-relaxed">"{t.quote}"</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-32 px-6 max-w-4xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Frequently Asked</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {[
              { q: "Which AI models can I access?", a: "Velora provides access to GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, and various open-source models like Llama 3." },
              { q: "Is my data secure and private?", a: "Yes. We use industry-standard encryption and do not train our models on your personal data. We are fully GDPR and SOC2 compliant." },
              { q: "Can I cancel my subscription anytime?", a: "Absolutely. You can cancel your Pro or Team subscription at any time from your account settings with one click." },
              { q: "Do you offer a student discount?", a: "Yes! We offer a 50% discount for students. Please contact our support team with your student email." }
            ].map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-white/10">
                <AccordionTrigger className="text-lg font-bold hover:no-underline text-white/80 hover:text-white py-6">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-white/50 text-base leading-relaxed pb-6">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* CTA Section */}
        <section className="py-32 px-6">
          <div className="container mx-auto text-center">
            <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-[3rem] border border-white/10 p-12 md:p-24 relative overflow-hidden group">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.15),transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <h2 className="text-4xl md:text-7xl font-black mb-8 tracking-tighter leading-[1.1]">Start using AI <br /> smarter today.</h2>
              <p className="text-white/60 text-lg md:text-xl mb-12 max-w-xl mx-auto">Join thousands of builders who are amplifying their productivity with Velora AI.</p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Link to={isSignedIn ? "/chat" : "/auth"}>
                  <Button size="lg" className="h-14 px-10 rounded-full bg-white text-black hover:bg-white/90 font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-2xl">
                    Get Started Free
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="h-14 px-10 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-lg">
                  View Docs
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-20 border-t border-white/5 bg-black/40 px-6">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
                  <img src="/logo.png" alt="Velora Logo" className="w-4 h-4 object-contain" />
                </div>
                <span className="font-bold text-lg">Velora AI</span>
              </div>
              <p className="text-white/40 text-sm leading-relaxed mb-6">
                The ultimate AI workspace for modern developers and creative professionals.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"><Share2 className="w-4 h-4" /></a>
                <a href="#" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"><Terminal className="w-4 h-4" /></a>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6">Product</h4>
              <ul className="space-y-4 text-sm text-white/40">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Enterprise</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6">Company</h4>
              <ul className="space-y-4 text-sm text-white/40">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-6">Resources</h4>
              <ul className="space-y-4 text-sm text-white/40">
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Community</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 gap-4">
            <p className="text-white/20 text-xs">© 2026 Velora Intelligence Inc. All rights reserved.</p>
            <div className="flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-white/20">
               <span>System Status: Online</span>
               <span>v2.4.0-stable</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
