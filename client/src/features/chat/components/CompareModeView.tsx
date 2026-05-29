import { useAuth } from "@clerk/react";
import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Cpu,
  Database,
  Download,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  Flame,
  Gauge,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import ChatHeader from "@/features/chat/components/ChatHeader";
import { supportsVision } from "@/features/chat/constants/chat.constants";
import type { Attachment } from "@/features/chat/hooks/useChatInput";
import type { Provider } from "@/features/chat/hooks/useAvailableProviders";
import { api, API_BASE_URL } from "@/lib/api";

interface StreamState {
  text: string;
  status: "idle" | "connecting" | "streaming" | "completed" | "failed";
  ttft: number | null;
  speed: number | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  duration: number | null;
  error: string | null;
}

interface CompareModeViewProps {
  currentChatId: string | null;
  selectedProvider: string;
  onMenuClick: () => void;
  onExitCompareMode: () => void;
}

const createInitialStreamState = (): StreamState => ({
  text: "",
  status: "idle",
  ttft: null,
  speed: null,
  usage: null,
  duration: null,
  error: null,
});

const getModelBrandName = (modelId?: string) => {
  if (!modelId) return "AI Provider";
  const id = modelId.toLowerCase();
  if (id.includes("gemini")) return "Google Gemini";
  if (id.includes("openai") || id.includes("gpt")) return "OpenAI";
  if (id.includes("nvidia")) return "NVIDIA AI";
  return "AI Model";
};

const getCleanModelName = (modelName?: string) => {
  if (!modelName) return "Unknown Model";
  const parts = modelName.split(":");
  const name = parts.length > 1 ? parts[1] : parts[0];
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
};

const rankStyles = {
  1: {
    tone: "border-amber-300/30 bg-amber-300/[0.08] text-amber-100",
  },
  2: {
    tone: "border-slate-300/18 bg-slate-300/[0.06] text-slate-100",
  },
  3: {
    tone: "border-orange-300/25 bg-orange-300/[0.07] text-orange-100",
  },
} as const;

const estimateUsage = (prompt: string, output: string) => ({
  promptTokens: Math.round(prompt.length / 4),
  completionTokens: Math.round(output.length / 4),
  totalTokens: Math.round((prompt.length + output.length) / 4),
});

const truncateString = (str: string, maxLength = 100) => {
  if (!str) return "";
  const trimmed = str.trim();
  return trimmed.length > maxLength ? `${trimmed.substring(0, maxLength)}...` : trimmed;
};

const CompareModeView = ({
  currentChatId,
  selectedProvider,
  onMenuClick,
  onExitCompareMode,
}: CompareModeViewProps) => {
  const { getToken } = useAuth();
  const [compareModels, setCompareModels] = useState<string[]>([]);
  const [comparePrompt, setComparePrompt] = useState("");
  const [isComparing, setIsComparing] = useState(false);
  const [compareStreams, setCompareStreams] = useState<Record<string, StreamState>>({});
  const [availableModels, setAvailableModels] = useState<Provider[]>([]);
  const [activePlusCardDropdown, setActivePlusCardDropdown] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [compareAttachments, setCompareAttachments] = useState<Attachment[]>([]);
  const [isCompareUploading, setIsCompareUploading] = useState(false);
  const [replacingModelId, setReplacingModelId] = useState<string | null>(null);
  const compareFileInputRef = useRef<HTMLInputElement>(null);
  const compareAbortControllersRef = useRef<Record<string, AbortController>>({});
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compareModels.length > 0) return;
    const activeProvider = selectedProvider || "gemini:gemini-2.0-flash";
    setCompareModels([activeProvider]);
    setCompareStreams({ [activeProvider]: createInitialStreamState() });
  }, [selectedProvider, compareModels.length]);

  useEffect(() => {
    let active = true;

    const loadProviders = async () => {
      try {
        const res = await api.get("/ai/providers");
        if (active) setAvailableModels(res.data.providers || []);
      } catch (err) {
        console.warn("Retrying loading providers...", err);
        setTimeout(() => {
          if (active) loadProviders();
        }, 1500);
      }
    };

    loadProviders();
    return () => {
      active = false;
      Object.values(compareAbortControllersRef.current).forEach((ctrl) => ctrl.abort());
      compareAbortControllersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const exportToJSON = () => {
    try {
      const dataToExport = {
        comparisonId: `compare-${Date.now()}`,
        timestamp: new Date().toISOString(),
        prompt: truncateString(comparePrompt),
        models: compareModels.map((modelId) => {
          const state = compareStreams[modelId] || createInitialStreamState();
          return {
            modelId,
            brandName: getModelBrandName(modelId),
            modelName: getCleanModelName(modelId),
            status: state.status,
            latencyMs: state.ttft,
            speedTokensPerSecond: state.speed,
            tokens: state.usage,
            durationSeconds: state.duration,
            responseText: truncateString(state.text),
            error: state.error,
          };
        }),
      };

      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `model_comparison_${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Successfully exported comparison to JSON!");
      setIsExportDropdownOpen(false);
    } catch (error) {
      console.error("Failed to export to JSON:", error);
      toast.error("Failed to export to JSON.");
    }
  };

  const escapeCsvCell = (val: any): string => {
    if (val === null || val === undefined) return "";
    let str = String(val);
    str = str.replace(/"/g, '""');
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str}"`;
    }
    return str;
  };

  const exportToCSV = () => {
    try {
      const headers = [
        "Prompt",
        "Model ID",
        "Model Name",
        "Brand",
        "Status",
        "Latency (ms)",
        "Tokens (Prompt)",
        "Tokens (Completion)",
        "Tokens (Total)",
        "Speed (t/s)",
        "Duration (s)",
        "Response/Output",
        "Error",
      ];

      const rows = compareModels.map((modelId) => {
        const state = compareStreams[modelId] || createInitialStreamState();
        return [
          truncateString(comparePrompt),
          modelId,
          getCleanModelName(modelId),
          getModelBrandName(modelId),
          state.status,
          state.ttft !== null ? state.ttft : "",
          state.usage ? state.usage.promptTokens : "",
          state.usage ? state.usage.completionTokens : "",
          state.usage ? state.usage.totalTokens : "",
          state.speed !== null ? state.speed : "",
          state.duration !== null ? state.duration : "",
          truncateString(state.text),
          state.error || "",
        ];
      });

      const csvContent = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((row) => row.map(escapeCsvCell).join(",")),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `model_comparison_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Successfully exported comparison to CSV!");
      setIsExportDropdownOpen(false);
    } catch (error) {
      console.error("Failed to export to CSV:", error);
      toast.error("Failed to export to CSV.");
    }
  };

  const updateSingleStream = (modelId: string, updates: Partial<StreamState>) => {
    setCompareStreams((prev) => ({
      ...prev,
      [modelId]: {
        ...(prev[modelId] ?? createInitialStreamState()),
        ...updates,
      },
    }));
  };

  const handleCompareFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Only images are supported in comparison vision mode.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setIsCompareUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await api.post("/upload/image", formData);
      setCompareAttachments((prev) => [
        ...prev,
        {
          url: res.data.url,
          name: file.name,
          mimeType: file.type,
          size: file.size,
        },
      ]);
      toast.success("Image uploaded successfully.");
    } catch (err) {
      console.error("Upload failed", err);
      toast.error("Failed to upload image.");
    } finally {
      setIsCompareUploading(false);
      if (compareFileInputRef.current) compareFileInputRef.current.value = "";
    }
  };

  const handleCompareCopyText = (modelId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(modelId);
    toast.success("Response copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCompareGridClass = () => {
    const totalSlots = compareModels.length + (compareModels.length < 3 ? 1 : 0);
    if (totalSlots === 1) return "grid-cols-1";
    if (totalSlots === 2) return "grid-cols-1 md:grid-cols-2";
    return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  };

  const getWinnerBadges = (modelId: string) => {
    const activeStreams = Object.entries(compareStreams);
    const isAnyRunning = activeStreams.some(([, state]) => state.status === "streaming" || state.status === "connecting");
    if (isComparing || isAnyRunning) return null;

    const completed = activeStreams.filter(([, state]) => state.status === "completed" && state.ttft !== null);
    if (completed.length <= 1) return null;

    const sortedBySpeed = [...completed].sort((a, b) => (b[1].speed || 0) - (a[1].speed || 0));
    const sortedByLatency = [...completed].sort((a, b) => (a[1].ttft || 0) - (b[1].ttft || 0));
    const sortedByTokens = [...completed].sort((a, b) => (a[1].usage?.totalTokens ?? Infinity) - (b[1].usage?.totalTokens ?? Infinity));
    const rank = (list: typeof completed, id: string) => list.findIndex(([mId]) => mId === id) + 1;
    const overall = completed
      .map(([mId]) => ({ mId, score: rank(sortedBySpeed, mId) + rank(sortedByLatency, mId) + rank(sortedByTokens, mId) }))
      .sort((a, b) => a.score - b.score);
    const overallRank = overall.findIndex((item) => item.mId === modelId) + 1;
    const state = compareStreams[modelId];

    const rankStyle = rankStyles[overallRank as keyof typeof rankStyles];
    const speedWinner = rank(sortedBySpeed, modelId) === 1 && (state?.speed || 0) > 0;
    const latencyWinner = rank(sortedByLatency, modelId) === 1 && (state?.ttft || 0) > 0;
    const tokenWinner = rank(sortedByTokens, modelId) === 1 && (state?.usage?.totalTokens || 0) > 0;

    return (
      <div className="flex items-center justify-between gap-3">
        {rankStyle && (
          <span className={`inline-flex w-fit items-center rounded-md border px-3 py-1.5 text-sm font-semibold ${rankStyle.tone}`}>
            #{overallRank}
          </span>
        )}

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {(speedWinner || latencyWinner || tokenWinner) && (
            <>
            {speedWinner && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                <Flame size={12} className="fill-amber-300 text-amber-300" />
                Fastest
              </span>
            )}
            {latencyWinner && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
                <Zap size={12} />
                Lowest latency
              </span>
            )}
            {tokenWinner && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                <Database size={12} />
                Efficient tokens
              </span>
            )}
            </>
          )}
        </div>
      </div>
    );
  };

  const streamSingleCompareModel = async (modelId: string, promptText: string, token: string | null, signal: AbortSignal) => {
    const startTime = performance.now();
    let hasReceivedFirstToken = false;
    let accumulatedText = "";
    let firstTokenTime = 0;
    let latency: number | null = null;
    let duration: number | null = null;
    let usage: StreamState["usage"] = null;
    let speed: number | null = null;

    try {
      const response = await fetch(`${API_BASE_URL}/ai/compare/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: promptText, provider: modelId, attachments: compareAttachments }),
        signal,
      });

      if (!response.ok) {
        let errorMessage = `HTTP Error ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData?.error) errorMessage = errorData.error;
        } catch {
          // Keep the HTTP fallback.
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Stream reader not available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const trimmed = rawEvent.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("\n");

          if (!jsonStr) continue;

          let data: any;
          try {
            data = JSON.parse(jsonStr);
          } catch (err) {
            console.error("Error parsing event JSON:", err);
            continue;
          }

          if (data?.error) throw new Error(data.error);

          if (data?.chunk) {
            if (!hasReceivedFirstToken) {
              hasReceivedFirstToken = true;
              firstTokenTime = performance.now();
              latency = Math.round(firstTokenTime - startTime);
              updateSingleStream(modelId, { status: "streaming", ttft: latency });
            }

            accumulatedText += data.chunk;
            const elapsedSeconds = (performance.now() - (firstTokenTime || startTime)) / 1000;
            const currentSpeed = elapsedSeconds > 0 ? Math.round((accumulatedText.length / 4) / elapsedSeconds) : 0;
            updateSingleStream(modelId, { text: accumulatedText, speed: currentSpeed > 0 ? currentSpeed : null });
          }

          if (data?.done) {
            duration = Math.round((performance.now() - startTime) / 10) / 100;
            const finalUsage = data.usage || estimateUsage(promptText, accumulatedText);
            usage = finalUsage;
            speed = duration > 0 ? Math.round(finalUsage.completionTokens / duration) : 0;
            updateSingleStream(modelId, { status: "completed", usage, duration, speed: speed > 0 ? speed : null });
          }
        }
      }

      if (!duration) {
        duration = Math.round((performance.now() - startTime) / 10) / 100;
        const finalUsage = estimateUsage(promptText, accumulatedText);
        usage = finalUsage;
        speed = duration > 0 ? Math.round(finalUsage.completionTokens / duration) : 0;
        updateSingleStream(modelId, { status: "completed", usage, duration, speed: speed > 0 ? speed : null });
      }
    } catch (err) {
      if (signal.aborted) {
        duration = Math.round((performance.now() - startTime) / 10) / 100;
        const finalUsage = estimateUsage(promptText, accumulatedText);
        usage = finalUsage;
        speed = duration > 0 ? Math.round(finalUsage.completionTokens / duration) : 0;
        updateSingleStream(modelId, { text: accumulatedText, status: "completed", ttft: latency, usage, duration, speed: speed > 0 ? speed : null, error: null });
        return;
      }

      console.error(`Stream error for model ${modelId}:`, err);
      updateSingleStream(modelId, {
        text: accumulatedText,
        status: "failed",
        ttft: latency,
        speed,
        usage,
        duration,
        error: "Model is down. Please try again later.",
      });
    } finally {
      delete compareAbortControllersRef.current[modelId];
    }
  };

  const handleStopCompareComparison = () => {
    Object.values(compareAbortControllersRef.current).forEach((ctrl) => ctrl.abort());
    compareAbortControllersRef.current = {};
    setIsComparing(false);
    toast.info("Comparison streaming stopped.");
  };

  const runCompareComparison = async () => {
    if (!comparePrompt.trim() && compareAttachments.length === 0) {
      toast.warning("Please enter a prompt or upload an image first.");
      return;
    }

    if (compareModels.length === 0) {
      toast.warning("Please select at least one model to compare.");
      return;
    }

    Object.values(compareAbortControllersRef.current).forEach((ctrl) => ctrl.abort());
    compareAbortControllersRef.current = {};

    const freshStreams: Record<string, StreamState> = {};
    compareModels.forEach((id) => {
      const skipForVision = compareAttachments.length > 0 && !supportsVision(id);
      freshStreams[id] = {
        ...createInitialStreamState(),
        status: skipForVision ? "failed" : "connecting",
        error: skipForVision ? "Vision not supported by this model. Replace with a vision model to compare." : null,
      };
    });
    setCompareStreams(freshStreams);
    setIsComparing(true);

    const token = await getToken();
    const promises = compareModels.map((modelId) => {
      if (compareAttachments.length > 0 && !supportsVision(modelId)) return Promise.resolve();
      const controller = new AbortController();
      compareAbortControllersRef.current[modelId] = controller;
      return streamSingleCompareModel(modelId, comparePrompt, token, controller.signal);
    });

    try {
      await Promise.allSettled(promises);
    } catch (err) {
      console.error("Error running concurrent comparisons:", err);
      toast.error("Failed to run comparisons.");
    } finally {
      setIsComparing(false);
      compareAbortControllersRef.current = {};
    }
  };

  const replaceModel = (oldId: string, newId: string) => {
    setCompareModels((prev) => prev.map((id) => (id === oldId ? newId : id)));
    setCompareStreams((prev) => {
      const next = { ...prev };
      delete next[oldId];
      next[newId] = createInitialStreamState();
      return next;
    });
    setReplacingModelId(null);
  };

  const addModel = (modelId: string) => {
    setCompareModels((prev) => [...prev, modelId]);
    setCompareStreams((prev) => ({ ...prev, [modelId]: createInitialStreamState() }));
    setActivePlusCardDropdown(false);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isComparing) {
      handleStopCompareComparison();
    } else {
      runCompareComparison();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090b] text-zinc-100 overflow-hidden relative">
      <ChatHeader
        currentChatId={currentChatId}
        onMenuClick={onMenuClick}
        isCompareMode
        onCompareToggle={onExitCompareMode}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 pb-36 md:px-6 md:py-6 z-10">
        {!isComparing && Object.values(compareStreams).some((state) => state.text.trim().length > 0) && (
          <div className="relative z-40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 p-4 rounded-xl border border-white/[0.06] bg-zinc-950/40 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.05] bg-white/[0.02] text-purple-400">
                <Sparkles size={14} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Comparison Report</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Evaluate metrics and export results</p>
              </div>
            </div>

            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-zinc-900/60 hover:bg-zinc-800/80 px-4 text-xs font-semibold text-zinc-200 hover:text-white transition cursor-pointer select-none"
              >
                <Download size={13} />
                <span>Export Analysis</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${isExportDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isExportDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-44 rounded-lg border border-white/[0.08] bg-zinc-950 p-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  <button
                    onClick={exportToJSON}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-white transition cursor-pointer"
                  >
                    <FileJson size={14} className="text-amber-400" />
                    <span>Export as JSON</span>
                  </button>
                  <button
                    onClick={exportToCSV}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-white transition cursor-pointer"
                  >
                    <FileSpreadsheet size={14} className="text-emerald-400" />
                    <span>Export as CSV</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`grid ${getCompareGridClass()} gap-4 md:gap-5 h-full min-h-[360px]`}>
          {compareModels.map((modelId) => {
            const state = compareStreams[modelId] || createInitialStreamState();
            const hasResponse = state.text.trim().length > 0;
            const showVisionWarning = compareAttachments.length > 0 && !supportsVision(modelId);
            const visionModels = availableModels.filter((model) => !compareModels.includes(model.id) && supportsVision(model.id));
            const winnerBadges = getWinnerBadges(modelId);

            return (
              <div
                key={modelId}
                className={`flex flex-col rounded-xl border border-white/[0.08] bg-zinc-950/70 relative overflow-hidden transition-all duration-200 min-h-[390px] h-[calc(100vh-230px)] shadow-2xl ${
                  state.status === "streaming" || isComparing ? "border-white/[0.16] shadow-zinc-950/40" : ""
                }`}
              >
                <div className="px-5 py-4 border-b border-white/[0.07] flex flex-col justify-center select-none z-30 relative bg-zinc-950/70 backdrop-blur-sm">
                  <div className="flex items-center justify-between w-full">
                    <div className="min-w-0 flex-1 pr-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{getModelBrandName(modelId)}</span>
                      <h3 className="mt-1 truncate font-display text-lg font-semibold text-white">{getCleanModelName(modelId)}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border ${
                        state.status === "completed"
                          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          : state.status === "failed"
                            ? "text-rose-400 bg-rose-950/20 border-rose-500/20"
                            : state.status === "streaming"
                              ? "text-zinc-300 bg-zinc-800 border-zinc-600"
                              : state.status === "connecting"
                                ? "text-zinc-400 bg-zinc-800/50 border-zinc-700/60 animate-pulse"
                                : "text-zinc-500 bg-zinc-900 border-zinc-800"
                      }`}>
                        {state.status === "idle" ? "Ready" : state.status === "completed" ? "Finished" : state.status === "streaming" ? "Generating" : state.status}
                      </span>
                      {compareModels.length > 1 && (
                        <button
                          onClick={() => {
                            setCompareModels((prev) => prev.filter((id) => id !== modelId));
                            setCompareStreams((prev) => {
                              const next = { ...prev };
                              delete next[modelId];
                              return next;
                            });
                          }}
                          className="text-zinc-500 hover:text-rose-300 transition-colors p-1.5 rounded-md hover:bg-white/5 cursor-pointer"
                          title="Remove Model"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {winnerBadges && <div className="mt-4 w-full animate-fade-in">{winnerBadges}</div>}
                </div>

                <div className={`flex flex-col flex-1 min-h-0 ${showVisionWarning ? "opacity-20 pointer-events-none filter blur-[0.5px]" : ""}`}>
                  <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.035] px-3 py-2.5">
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Clock size={13} />Latency</span>
                      <p className="mt-1 text-lg font-semibold text-zinc-100">{state.ttft !== null ? `${state.ttft} ms` : "-"}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.035] px-3 py-2.5">
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Database size={13} />Tokens</span>
                      <p className="mt-1 text-lg font-semibold text-zinc-100" title={state.usage ? `Prompt: ${state.usage.promptTokens} | Completion: ${state.usage.completionTokens}` : undefined}>
                        {state.usage ? state.usage.totalTokens : "-"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.035] px-3 py-2.5">
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Gauge size={13} />Speed</span>
                      <p className="mt-1 text-lg font-semibold text-zinc-100">{state.speed !== null ? `${state.speed} t/s` : "-"}</p>
                    </div>
                  </div>

                  <div className="flex-1 p-5 overflow-y-auto min-h-0 text-[15px] text-zinc-300 leading-7 scrollbar-thin">
                    {state.status === "idle" && (
                      <div className="h-full flex flex-col items-center justify-center text-center select-none">
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.035] text-zinc-400">
                          <Cpu size={18} />
                        </div>
                        <p className="text-sm font-medium text-zinc-400">Awaiting prompt</p>
                      </div>
                    )}
                    {state.status === "connecting" && (
                      <div className="space-y-3">
                        <div className="h-3 bg-white/[0.06] rounded w-3/4 animate-pulse" />
                        <div className="h-3 bg-white/[0.06] rounded w-5/6 animate-pulse" />
                        <div className="h-3 bg-white/[0.06] rounded w-2/3 animate-pulse" />
                      </div>
                    )}
                    {state.status === "failed" && state.error && (
                      <div className="rounded-lg border border-rose-500/15 bg-rose-500/5 p-4 text-rose-300/90 flex items-start gap-3">
                        <AlertCircle size={16} className="shrink-0 mt-1" />
                        <div>
                          <p className="font-semibold text-rose-200">Generation failed</p>
                          <p className="text-sm mt-1 leading-6 text-rose-200/70">{state.error}</p>
                        </div>
                      </div>
                    )}
                    {hasResponse && (() => {
                      // Convert LaTeX block math \[ \] to $$ $$
                      let processedText = state.text.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$');
                      // Convert LaTeX inline math \( \) to $ $
                      processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
                      
                      return (
                      <div className="prose prose-invert max-w-none will-change-scroll prose-p:text-zinc-300 prose-p:leading-7 prose-li:text-zinc-300 prose-strong:text-zinc-100 prose-headings:text-zinc-50">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={{
                            p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                            pre: ({ children }) => <pre className="p-4 bg-zinc-950/70 border border-white/[0.08] rounded-lg overflow-x-auto text-[13px] font-mono mb-3">{children}</pre>,
                            code: ({ children }) => <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[13px] font-mono text-zinc-200">{children}</code>,
                          }}
                        >
                          {processedText}
                        </ReactMarkdown>
                        {state.status === "streaming" && <span className="inline-block w-1.5 h-4 ml-1 bg-zinc-300 animate-pulse align-middle" />}
                      </div>
                      );
                    })()}
                  </div>

                  <div className="px-5 py-3 border-t border-white/[0.06] bg-zinc-950/35 shrink-0 text-xs text-zinc-500 flex items-center justify-between select-none">
                    <div className="flex items-center gap-3.5">
                      {state.duration !== null && <span className="flex items-center gap-1.5"><Clock size={12} />{state.duration}s</span>}
                    </div>
                    {hasResponse && (
                      <button onClick={() => handleCompareCopyText(modelId, state.text)} className="p-1.5 text-zinc-500 hover:text-zinc-200 rounded-md hover:bg-white/5 cursor-pointer transition-colors" title="Copy Response">
                        {copiedId === modelId ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {showVisionWarning && (
                  <div className="absolute inset-x-0 bottom-0 top-[74px] z-20 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-[2px] p-6 text-center">
                    <div className="h-11 w-11 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-300 mb-3 animate-pulse"><EyeOff size={18} /></div>
                    <h4 className="text-sm font-semibold text-zinc-100">Vision not supported</h4>
                    <p className="text-sm text-zinc-500 mt-2 max-w-[240px] leading-6">{getCleanModelName(modelId)} cannot process images. Swap with a vision-capable engine to compare.</p>
                    {replacingModelId === modelId ? (
                      <div className="mt-5 w-full max-w-[300px] overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950 text-left shadow-2xl">
                        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3.5 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-100">Select vision model</p>
                            <p className="mt-0.5 text-xs text-zinc-500">Choose a model that supports images</p>
                          </div>
                          <button
                            onClick={() => setReplacingModelId(null)}
                            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="max-h-52 overflow-y-auto p-1.5 scrollbar-thin">
                          {visionModels.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => replaceModel(modelId, model.id)}
                              className="group w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.055] cursor-pointer"
                            >
                              <span className="block truncate text-sm font-medium text-zinc-300 group-hover:text-white">
                                {getCleanModelName(model.name)}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-zinc-600 group-hover:text-zinc-500">
                                {getModelBrandName(model.id)}
                              </span>
                            </button>
                          ))}
                          {visionModels.length === 0 && (
                            <div className="px-3 py-6 text-center">
                              <p className="text-sm font-medium text-zinc-400">No vision models available</p>
                              <p className="mt-1 text-xs text-zinc-600">Remove the image or add another provider.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setReplacingModelId(modelId)} className="mt-4 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 text-sm font-semibold rounded-lg transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]">Replace Model</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {compareModels.length < 3 && (
            <div className="flex flex-col rounded-xl border border-dashed border-white/[0.11] bg-white/[0.02] relative overflow-hidden transition-all duration-200 hover:border-white/[0.18] hover:bg-white/[0.04] min-h-[390px] h-[calc(100vh-230px)] items-center justify-center p-6 text-center select-none">
              {!activePlusCardDropdown ? (
                <button onClick={() => setActivePlusCardDropdown(true)} className="flex flex-col items-center gap-3 cursor-pointer group/btn">
                  <div className="h-12 w-12 rounded-lg border border-white/[0.08] flex items-center justify-center bg-zinc-950 text-zinc-400 group-hover/btn:text-white group-hover/btn:border-white/20 transition-all"><Plus size={20} /></div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">Add model</h4>
                    <p className="text-sm text-zinc-500 mt-1 max-w-[180px]">Compare another engine side-by-side</p>
                  </div>
                </button>
              ) : (
                <div className="w-full max-w-[240px] flex flex-col gap-1.5 z-20">
                  <div className="flex justify-between items-center mb-1 pb-1 border-b border-zinc-800/40">
                    <span className="text-xs font-semibold text-zinc-400">Choose model</span>
                    <button onClick={() => setActivePlusCardDropdown(false)} className="text-xs text-zinc-500 hover:text-zinc-300 font-semibold cursor-pointer">Cancel</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto pr-1 flex flex-col gap-1 text-left scrollbar-thin">
                    {availableModels.filter((model) => !compareModels.includes(model.id)).map((model) => (
                      <button key={model.id} onClick={() => addModel(model.id)} className="w-full text-sm px-3 py-2 rounded-lg text-left bg-zinc-900/40 hover:bg-white/5 text-zinc-400 hover:text-white transition cursor-pointer">
                        {getCleanModelName(model.name)}
                      </button>
                    ))}
                    {availableModels.filter((model) => !compareModels.includes(model.id)).length === 0 && <p className="text-xs text-zinc-600 text-center py-2">No other models available</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none pb-5 px-4 md:pb-6 md:px-6 bg-[#09090b] pt-4 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto pointer-events-auto bg-zinc-950 border border-white/[0.09] rounded-xl p-3 shadow-2xl">
          {compareAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pb-2 border-b border-zinc-800/40 mb-2">
              {compareAttachments.map((attachment, index) => (
                <div key={`${attachment.url}-${index}`} className="group/att relative h-12 w-12 rounded-lg overflow-hidden border border-zinc-800/60 bg-white/5">
                  <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setCompareAttachments((prev) => prev.filter((_, idx) => idx !== index))} className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity cursor-pointer hover:bg-black">
                    <X size={8} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <button type="button" disabled={isComparing || isCompareUploading} onClick={() => compareFileInputRef.current?.click()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-zinc-400 hover:text-white hover:border-white/20 transition cursor-pointer hover:bg-white/5 disabled:opacity-40 disabled:pointer-events-none" title="Upload Image">
              {isCompareUploading ? <div className="h-4 w-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin" /> : <Paperclip size={15} />}
            </button>
            <input type="file" ref={compareFileInputRef} onChange={handleCompareFileChange} accept="image/*" className="hidden" disabled={isComparing || isCompareUploading} />
            <textarea
              value={comparePrompt}
              onChange={(event) => setComparePrompt(event.target.value)}
              placeholder="Send a message to compare all models concurrently..."
              rows={1}
              disabled={isComparing}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!isComparing) runCompareComparison();
                }
              }}
              className="flex-1 bg-transparent border-0 text-[15px] leading-6 text-zinc-100 placeholder-zinc-500 focus:ring-0 resize-none max-h-32 py-2.5 focus:outline-none min-h-[44px]"
            />
            <button type="submit" className={`flex h-11 items-center justify-center rounded-lg font-semibold text-sm transition-all duration-300 px-4 cursor-pointer shadow-md shrink-0 ${isComparing ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/10 active:scale-[0.95]" : "bg-zinc-100 hover:bg-white text-zinc-950 shadow-white/5 active:scale-[0.95]"}`}>
              {isComparing ? <span className="flex items-center gap-1.5"><Square size={12} className="fill-white" />Stop</span> : <span className="flex items-center gap-1.5"><Sparkles size={12} />Compare</span>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompareModeView;
