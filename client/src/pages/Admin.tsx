import React, { useEffect, useState, useMemo } from "react";
import { useUser } from "@clerk/react";
import Loading from "@/features/chat/components/Loading";
import McpAdminTab from "@/features/admin/components/McpAdminTab";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  User as UserIcon,
  MessageSquare,

  Search,
  ChevronUp,
  ChevronDown,
  Brain,
  Activity,
  UserCheck,
  BarChart3,
  Zap,
  TrendingUp,
  Database,
  Clock,
  RefreshCw,
  Sliders
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

interface GlobalModelUse {
  model: string;
  count: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
}

interface UserStat {
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  createdAt: string;
  lastSignInAt?: string;
  role: string;
  favoriteModel: string;
  totalChats: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

interface AdminStats {
  totalUsersCount: number;
  totalChatsCount: number;
  totalMessagesCount?: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  globalModelUsage: GlobalModelUse[];
  usersList: UserStat[];
}

const getModelShortName = (model: string) => {
  if (!model || model === "None") return "No messages";
  return model.split("/").pop() || model;
};

// ==========================================
// 1. ACTIVE MODEL TELEMETRY LIST
// ==========================================
interface ModelUsageListProps {
  usage: GlobalModelUse[];
}

const ModelUsageList: React.FC<ModelUsageListProps> = ({ usage }) => {
  const listData = useMemo(() => {
    const activeTotalTokens = usage.reduce((sum, item) => sum + (item.tokens || 0), 0);
    return usage.map((item) => {
      const percent = activeTotalTokens > 0 ? (item.tokens / activeTotalTokens) * 100 : 0;
      return {
        name: getModelShortName(item.model),
        value: item.tokens,
        promptTokens: item.promptTokens,
        completionTokens: item.completionTokens,
        messages: item.count,
        fullName: item.model,
        percent: Math.min(percent, 100)
      };
    });
  }, [usage]);

  const getModelBulletColor = (model: string) => {
    const m = model.toLowerCase();
    if (m.includes("gemini")) return "bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.4)]";
    if (m.includes("nvidia") || m.includes("nemotron")) return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]";
    if (m.includes("openai") || m.includes("gpt")) return "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.4)]";
    if (m.includes("deepseek")) return "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]";
    return "bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.4)]";
  };

  const getModelProgressColor = (model: string) => {
    const m = model.toLowerCase();
    if (m.includes("gemini")) return "from-purple-500 to-indigo-500";
    if (m.includes("nvidia") || m.includes("nemotron")) return "from-emerald-500 to-teal-500";
    if (m.includes("openai") || m.includes("gpt")) return "from-sky-500 to-blue-500";
    if (m.includes("deepseek")) return "from-cyan-500 to-sky-500";
    return "from-slate-500 to-slate-400";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
      {listData.map((item) => (
        <div
          key={item.fullName}
          className="p-4 rounded-2.5xl border border-white/5 bg-slate-900/20 hover:bg-slate-900/40 transition-all duration-300 flex flex-col gap-3 group"
        >
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`h-3 w-3 rounded-full shrink-0 ${getModelBulletColor(item.fullName)}`} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate leading-tight">
                  {item.name}
                </p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {item.messages.toLocaleString()} queries loaded
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <p className="text-sm font-mono font-black text-white">
                {item.percent.toFixed(1)}%
              </p>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                {item.value ? item.value.toLocaleString() : 0} tkns
              </p>
            </div>
          </div>

          {/* Per-model token breakdown */}
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <span className="flex items-center gap-1.5 text-sky-400/80">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Input: {(item.promptTokens || 0).toLocaleString()}
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Output: {(item.completionTokens || 0).toLocaleString()}
            </span>
          </div>

          {/* Stacked ratio bar showing input vs output */}
          <div className="w-full h-1.5 bg-slate-800/40 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-sky-500/80"
              style={{ width: `${item.value > 0 ? (item.promptTokens / item.value) * 100 : 0}%`, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)" }}
            />
            <div
              className="h-full bg-emerald-500/80"
              style={{ width: `${item.value > 0 ? (item.completionTokens / item.value) * 100 : 0}%`, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ==========================================
// 2. RECHARTS COMPARATIVE DUAL BAR CHART
// ==========================================
interface ModelVolumeBarChartProps {
  usage: GlobalModelUse[];
  stats: AdminStats;
}

const ModelVolumeBarChart: React.FC<ModelVolumeBarChartProps> = ({ usage, stats }) => {
  // Map data for BarChart
  const barData = useMemo(() => {
    return usage.map((item) => ({
      name: getModelShortName(item.model),
      messages: item.count,
      tokens: item.tokens,
      promptTokens: item.promptTokens,
      completionTokens: item.completionTokens,
      fullName: item.model
    }));
  }, [usage]);

  // Glassmorphic custom tooltip for bar chart
  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-950/95 border border-white/10 backdrop-blur-md px-5 py-4 rounded-3xl shadow-2xl flex flex-col gap-1.5 animate-in fade-in leading-relaxed select-none">
          <p className="text-sm font-black text-white uppercase tracking-wider">{data.name}</p>
          <div className="h-[1px] w-full bg-white/5 my-0.5" />
          <p className="text-xs text-slate-300 font-semibold font-sans flex items-center justify-between gap-4">
            <span>Messages:</span>
            <span className="font-mono text-white font-bold">{data.messages.toLocaleString()}</span>
          </p>
          <p className="text-xs text-sky-400 font-semibold font-sans flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-400"/>Input:</span>
            <span className="font-mono text-white font-bold">{(data.promptTokens || 0).toLocaleString()}</span>
          </p>
          <p className="text-xs text-emerald-400 font-semibold font-sans flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>Output:</span>
            <span className="font-mono text-white font-bold">{(data.completionTokens || 0).toLocaleString()}</span>
          </p>
          <div className="h-[1px] w-full bg-white/5 my-0.5" />
          <p className="text-xs text-purple-400 font-semibold font-sans flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-purple-400"/>Total:</span>
            <span className="font-mono text-white font-bold">{data.tokens.toLocaleString()}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-950 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 w-full">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <Activity size={16} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Payload Comparison Bar</h3>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-sans">
            Queries (Left Axis) vs Token Load (Right Axis)
          </p>
        </div>
      </div>

      {barData.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-center border border-dashed border-white/5 rounded-2xl">
          <Activity size={20} className="text-slate-700 mb-2 animate-pulse" />
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600">No telemetry data</p>
        </div>
      ) : (
        <div className="h-72 w-full pr-2 select-none min-w-0">
          <ResponsiveContainer width="99%" height={288}>
            <BarChart data={barData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="bar-grad-messages" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.15} />
                </linearGradient>
                <linearGradient id="bar-grad-tokens" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity={0.15} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
              
              <XAxis
                dataKey="name"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={8}
                fontFamily="var(--font-sans)"
                fontWeight="bold"
              />

              <YAxis
                yAxisId="left"
                stroke="#38bdf8"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${val}`}
                fontFamily="var(--font-mono)"
                fontWeight="bold"
              />

              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#34d399"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                fontFamily="var(--font-mono)"
                fontWeight="bold"
              />

              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)", radius: 10 }} />

              <Bar
                yAxisId="left"
                dataKey="messages"
                fill="url(#bar-grad-messages)"
                radius={[8, 8, 0, 0]}
                maxBarSize={36}
              />

              <Bar
                yAxisId="right"
                dataKey="tokens"
                fill="url(#bar-grad-tokens)"
                radius={[8, 8, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Info indicator metrics */}
      <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full bg-sky-400 shrink-0 shadow-[0_0_6px_rgba(56,189,248,0.5)]" />
          <span className="text-xs text-slate-400 font-bold font-sans">
            Total Queries: <span className="text-white font-mono font-black ml-1">{stats.totalMessagesCount?.toLocaleString() || 0}</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          <span className="text-xs text-slate-400 font-bold font-sans">
            Total Tokens: <span className="text-white font-mono font-black ml-1">{stats.totalTokens?.toLocaleString() || 0}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. CONVERSATIONAL DENSITY / EFFICIENCY LIST
// ==========================================
const ModelEfficiencyList: React.FC<{ usage: GlobalModelUse[] }> = ({ usage }) => {
  const sortedByDensity = useMemo(() => {
    return [...usage]
      .map((item) => ({
        ...item,
        density: item.count > 0 ? Math.round(item.tokens / item.count) : 0
      }))
      .sort((a, b) => b.density - a.density);
  }, [usage]);

  return (
    <div className="bg-slate-950 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
          <Zap size={16} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Conversational Density</h3>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Average tokens consumed per message exchange</p>
        </div>
      </div>

      {sortedByDensity.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center border border-dashed border-white/5 rounded-2xl">
          <Activity size={20} className="text-slate-700 mb-2 animate-pulse" />
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600">No telemetry loaded</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {sortedByDensity.map((item) => {
            return (
              <div
                key={item.model}
                className="p-3.5 bg-slate-900/20 border border-white/5 hover:border-white/10 hover:bg-slate-900/30 rounded-2xl flex items-center justify-between transition-all duration-300 group"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block truncate max-w-[220px]">
                    {getModelShortName(item.model)}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 block mt-0.5 font-bold uppercase tracking-wider">
                    {item.count} messages loaded
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
                    {item.density.toLocaleString()}{" "}
                    <span className="text-[9px] font-sans font-medium text-slate-400">tkns/msg</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==========================================
// MAIN ADMIN DASHBOARD WRAPPER COMPONENT
// ==========================================
const Admin: React.FC = () => {
  const { user: currentUser } = useUser();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<"name" | "chats" | "joined" | "tokens">("chats");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "performance" | "mcp">("overview");
  const [syncing, setSyncing] = useState<boolean>(false);

  const fetchStats = async (isSync = false) => {
    try {
      if (isSync) setSyncing(true);
      else setLoading(true);
      const { data } = await api.get("/admin/stats");
      setStats(data);
      if (isSync) toast.success("Telemetry synchronized with primary ledger");
    } catch (err: any) {
      console.error("Failed to load admin stats:", err);
      const errorMsg = err?.response?.data?.error || "Unauthorized. Admin role required.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRoleChange = async (targetClerkId: string, newRole: "user" | "admin") => {
    try {
      // Optimistic update
      if (stats) {
        const updatedUsers = stats.usersList.map((u) =>
          u.clerkId === targetClerkId ? { ...u, role: newRole } : u
        );
        setStats({ ...stats, usersList: updatedUsers });
      }

      await api.patch(`/admin/users/${targetClerkId}/role`, { role: newRole });
      toast.success(`User role successfully changed to ${newRole}`);
    } catch (err: any) {
      console.error("Failed to change user role:", err);
      const errorMsg = err?.response?.data?.error || "Failed to update role";
      toast.error(errorMsg);

      // Revert state
      fetchStats();
    }
  };

  // Filter and Sort Users list
  const filteredAndSortedUsers = useMemo(() => {
    if (!stats) return [];

    let result = [...stats.usersList];

    // 1. Search Query filter
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.email.toLowerCase().includes(query) ||
          `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase().includes(query)
      );
    }

    // 2. Sort
    result.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";

      if (sortField === "name") {
        aVal = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase() || a.email.toLowerCase();
        bVal = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase() || b.email.toLowerCase();
      } else if (sortField === "chats") {
        aVal = a.totalChats;
        bVal = b.totalChats;
      } else if (sortField === "joined") {
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
      } else if (sortField === "tokens") {
        aVal = a.totalTokens || 0;
        bVal = b.totalTokens || 0;
      }

      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [stats, searchQuery, sortField, sortAsc]);

  const handleSort = (field: "name" | "chats" | "joined" | "tokens") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getModelBadgeClass = (model: string) => {
    const m = model.toLowerCase();
    if (m === "none") return "bg-slate-800/60 text-slate-500 border-slate-700/50";
    if (m.includes("gemini")) return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    if (m.includes("nvidia") || m.includes("nemotron")) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (m.includes("openai") || m.includes("gpt")) return "bg-sky-500/10 text-sky-400 border-sky-500/20";
    if (m.includes("deepseek")) return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
    return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  };

  // Find max active values for relative visual progress indicators
  const maxChats = useMemo(() => {
    if (!stats || stats.usersList.length === 0) return 1;
    return Math.max(...stats.usersList.map((u) => u.totalChats), 1);
  }, [stats]);

  if (loading) {
    return <Loading message="Securing Connection..." />;
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center gap-6 p-4 text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-rose-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="p-8 bg-slate-900/40 backdrop-blur-2xl border border-rose-500/20 rounded-3xl max-w-md shadow-2xl">
          <Brain className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            You do not have the required administrative permissions to access the Velora analytics dashboard. Please sign in with an administrator account.
          </p>
          <a
            href="/chat"
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all shadow-xl shadow-black/20"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            <span>Return to Chat</span>
          </a>
        </div>
      </div>
    );
  }

  const activeModelsCount = stats.globalModelUsage.length;

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 flex flex-col relative overflow-x-hidden p-6 md:p-10 animate-in fade-in">
      {/* Glow animations */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[150px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-0 left-10 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-7xl w-full mx-auto flex flex-col gap-8 relative z-10">
        {/* Upper Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/5">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/20">
                Core Engine
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest font-sans">
                Analytics Active
              </span>
            </div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-3">
              Admin Dashboard
            </h1>
            <p className="text-xs font-semibold text-slate-400">
              System intelligence, active model shares, and participant insights
            </p>
          </div>

          <div className="flex items-center gap-4 self-start md:self-center">
            {/* Sync telemetry action button */}
            <button
              onClick={() => fetchStats(true)}
              disabled={syncing}
              className="flex items-center justify-center h-11 w-11 bg-slate-900 border border-white/5 hover:border-white/10 hover:text-white rounded-xl text-slate-400 disabled:opacity-40 transition-all shadow-xl hover:scale-105"
              title="Synchronize stats"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            </button>

            <a
              href="/chat"
              className="flex items-center gap-2 bg-slate-900 border border-white/5 hover:border-indigo-500/20 px-5 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-all shadow-xl hover:scale-[1.02]"
            >
              <ArrowLeft size={16} strokeWidth={2.5} />
              <span>Back to Chat</span>
            </a>
          </div>
        </div>

        {/* Analytics Summary Cards (6 columns) */}
        {/* Analytics Summary Cards (4 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Users */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-indigo-500/20 hover:bg-slate-900/60 transition-all flex items-center justify-between shadow-2xl hover:scale-[1.02] duration-300 group">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Users</p>
              <h3 className="text-3xl font-display font-bold text-white leading-none group-hover:text-indigo-400 transition-colors">
                {stats.totalUsersCount}
              </h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform shadow-inner border border-indigo-500/10 shrink-0">
              <UserIcon size={20} />
            </div>
          </div>

          {/* Card 2: Chats */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-sky-500/20 hover:bg-slate-900/60 transition-all flex items-center justify-between shadow-2xl hover:scale-[1.02] duration-300 group">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Chats</p>
              <h3 className="text-3xl font-display font-bold text-white leading-none group-hover:text-sky-400 transition-colors">
                {stats.totalChatsCount}
              </h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform shadow-inner border border-sky-500/10 shrink-0">
              <MessageSquare size={20} />
            </div>
          </div>

          {/* Card 3: Total Messages */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-emerald-500/20 hover:bg-slate-900/60 transition-all flex items-center justify-between shadow-2xl hover:scale-[1.02] duration-300 group">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Messages</p>
              <h3 className="text-3xl font-display font-bold text-white leading-none group-hover:text-emerald-400 transition-colors">
                {stats.totalMessagesCount || 0}
              </h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform shadow-inner border border-emerald-500/10 shrink-0">
              <Database size={20} />
            </div>
          </div>

          {/* Card 4: Total Tokens */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-purple-500/20 hover:bg-slate-900/60 transition-all flex items-center justify-between shadow-2xl hover:scale-[1.02] duration-300 group">
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Tokens</p>
              <h3 className="text-2xl font-display font-bold text-white leading-none group-hover:text-purple-400 transition-colors">
                {(stats.totalTokens || 0).toLocaleString()}
              </h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[9px] font-mono text-sky-400/70 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-400"/>In: {((stats.totalPromptTokens || 0) / 1000).toFixed(1)}k</span>
                <span className="text-[9px] font-mono text-emerald-400/70 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>Out: {((stats.totalCompletionTokens || 0) / 1000).toFixed(1)}k</span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0 group-hover:scale-110 transition-transform ml-2 shadow-inner border border-purple-500/10">
              <BarChart3 size={20} />
            </div>
          </div>
        </div>

        {/* Dashboard Section Tab Navigation Bar */}
        <div className="flex border-b border-white/5 gap-6 mb-2 pt-2">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-4 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "overview"
                ? "text-indigo-400 border-indigo-400 font-bold"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <BarChart3 size={14} />
            <span>Overview Hub</span>
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-4 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "users"
                ? "text-indigo-400 border-indigo-400 font-bold"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <UserCheck size={14} />
            <span>User Directory</span>
          </button>
          <button
            onClick={() => setActiveTab("performance")}
            className={`pb-4 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "performance"
                ? "text-indigo-400 border-indigo-400 font-bold"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <Zap size={14} />
            <span>Model Performance</span>
          </button>
          <button
            onClick={() => setActiveTab("mcp")}
            className={`pb-4 text-xs font-semibold uppercase tracking-widest border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "mcp"
                ? "text-indigo-400 border-indigo-400 font-bold"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <Sliders size={14} />
            <span>MCP Servers</span>
          </button>
        </div>

        {/* ==========================================
            TAB CONTENT: 1. OVERVIEW HUB
            ========================================== */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
            {/* Model Shares Telemetry List Card Column (2 spans for large and spacious responsive grid display) */}
            <div className="lg:col-span-2 bg-slate-950 border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                  <BarChart3 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Model Usage Shares</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-sans">
                    Relative platform token volume breakdown
                  </p>
                </div>
              </div>

              {stats.globalModelUsage.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/5 rounded-2xl">
                  <Activity size={20} className="text-slate-700 mb-2" />
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600">
                    No active models loaded
                  </p>
                </div>
              ) : (
                <ModelUsageList usage={stats.globalModelUsage} />
              )}
            </div>

            {/* Bar Chart and System signal Column (1 span) */}
            <div className="lg:col-span-1 flex flex-col gap-8">
              <ModelVolumeBarChart usage={stats.globalModelUsage} stats={stats} />

              {/* System status details card */}
              <div className="bg-slate-950/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Clock size={16} className="text-indigo-400" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-white">System Signal</span>
                  </div>
                  <span className="px-3 py-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 rounded-md uppercase tracking-wider">
                    Stable
                  </span>
                </div>
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Active Adapters</span>
                    <span className="font-mono text-slate-200 font-bold">{activeModelsCount} active</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Avg Msg Load</span>
                    <span className="font-mono text-slate-200 font-bold">
                      {stats.totalMessagesCount && stats.totalMessagesCount > 0
                        ? Math.round(stats.totalTokens / stats.totalMessagesCount).toLocaleString()
                        : 0}{" "}
                      tkns
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Telemetry Uptime</span>
                    <span className="font-mono text-slate-200 font-bold">99.98% operational</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB CONTENT: 2. USER DIRECTORY
            ========================================== */}
        {activeTab === "users" && (
          <div className="bg-slate-950 border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6 animate-in fade-in">
            {/* Directory Header and Search Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-3.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                  <UserCheck size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">User Activity Directory</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                    Active profiles and detailed resource consumption
                  </p>
                </div>
              </div>

              {/* Search Field */}
              <div className="relative group max-w-sm w-full">
                <input
                  type="text"
                  placeholder="Search user profile..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 group-hover:border-white/20 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-all font-sans"
                />
                <Search
                  size={14}
                  className="absolute left-3.5 top-3.5 text-slate-500 group-focus-within:text-white transition-colors"
                />
              </div>
            </div>

            {/* Redesigned User Directory Table */}
            <div className="overflow-x-auto min-h-0 flex-1">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 pb-4">
                    <th
                      className="pb-4 cursor-pointer select-none hover:text-white transition-colors"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>User Profile</span>
                        {sortField === "name" &&
                          (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </div>
                    </th>
                    <th
                      className="pb-4 hidden sm:table-cell cursor-pointer select-none hover:text-white transition-colors"
                      onClick={() => handleSort("joined")}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Joined Date</span>
                        {sortField === "joined" &&
                          (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </div>
                    </th>
                    <th
                      className="pb-4 text-right cursor-pointer select-none hover:text-white transition-colors pr-4"
                      onClick={() => handleSort("chats")}
                    >
                      <div className="flex items-center gap-1.5 justify-end">
                        <span>Chats / Contribution</span>
                        {sortField === "chats" &&
                          (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </div>
                    </th>
                    <th
                      className="pb-4 text-right cursor-pointer select-none hover:text-white transition-colors pr-4"
                      onClick={() => handleSort("tokens")}
                    >
                      <div className="flex items-center gap-1.5 justify-end">
                        <span>Tokens Used</span>
                        {sortField === "tokens" &&
                          (sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </div>
                    </th>
                    <th className="pb-4 text-right">Favorite Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAndSortedUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-12 text-center text-slate-600 text-xs font-semibold uppercase tracking-widest"
                      >
                        No matches found inside database
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedUsers.map((u) => {
                      const joinedDate = new Date(u.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      });

                      const totalContribution =
                        stats.totalChatsCount > 0
                          ? Math.round((u.totalChats / stats.totalChatsCount) * 100)
                          : 0;

                      const relativeProgress = Math.round((u.totalChats / maxChats) * 100);

                      return (
                        <tr key={u.clerkId} className="group hover:bg-white/1 transition-all">
                          <td className="py-4 pr-3">
                            <div className="flex items-center gap-3.5">
                              <div className="h-10 w-10 rounded-2xl overflow-hidden border border-white/5 shadow-inner shrink-0 relative">
                                {u.imageUrl ? (
                                  <img
                                    src={u.imageUrl}
                                    alt=""
                                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="h-full w-full bg-slate-800 flex items-center justify-center">
                                    <UserIcon size={14} className="text-slate-500" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-white truncate leading-tight flex items-center gap-2 flex-wrap">
                                  <span>{`${u.firstName || ""} ${u.lastName || ""}`.trim() || "User"}</span>
                                  <select
                                    value={u.role}
                                    disabled={u.clerkId === currentUser?.id}
                                    onChange={(e) =>
                                      handleRoleChange(u.clerkId, e.target.value as "user" | "admin")
                                    }
                                    className={`bg-slate-900 border border-white/10 hover:border-indigo-500/30 rounded-lg px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest focus:outline-none focus:border-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                                      u.role === "admin" ? "text-emerald-400" : "text-slate-400"
                                    }`}
                                  >
                                    <option value="user" className="bg-slate-950 text-slate-400 text-[9px] font-bold">
                                      User
                                    </option>
                                    <option value="admin" className="bg-slate-950 text-emerald-400 text-[9px] font-bold">
                                      Admin
                                    </option>
                                  </select>
                                </div>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 hidden sm:table-cell text-xs text-slate-400 font-medium">
                            {joinedDate}
                          </td>
                          <td className="py-4 text-right pr-4 min-w-[140px]">
                            <span className="text-sm font-semibold text-white font-mono">{u.totalChats}</span>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">
                              {totalContribution}% contribution
                            </p>
                            {/* Visual contribution bar */}
                            <div className="h-1 w-20 bg-white/5 rounded-full overflow-hidden ml-auto mt-1.5 border border-white/5">
                              <div
                                style={{ width: `${relativeProgress}%` }}
                                className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full transition-all duration-1000"
                              />
                            </div>
                          </td>
                          <td className="py-4 text-right pr-4">
                            <span className="text-sm font-semibold text-white font-mono">
                              {u.totalTokens?.toLocaleString() || 0}
                            </span>
                            <div className="flex items-center justify-end gap-3 mt-1">
                              <span className="text-[9px] text-sky-400/80 font-mono font-semibold flex items-center gap-1" title="Input tokens">
                                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0"/>
                                {((u.promptTokens || 0) / 1000).toFixed(1)}k
                              </span>
                              <span className="text-[9px] text-emerald-400/80 font-mono font-semibold flex items-center gap-1" title="Output tokens">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"/>
                                {((u.completionTokens || 0) / 1000).toFixed(1)}k
                              </span>
                            </div>
                          </td>
                          <td className="py-4 text-right">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${getModelBadgeClass(
                                u.favoriteModel
                              )}`}
                            >
                              {getModelShortName(u.favoriteModel)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB CONTENT: 3. MODEL PERFORMANCE
            ========================================== */}
        {activeTab === "performance" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
            {/* Efficiency breakdown chart list */}
            <div className="lg:col-span-2">
              <ModelEfficiencyList usage={stats.globalModelUsage} />
            </div>

            {/* Platform active agents intelligence summary */}
            <div className="lg:col-span-1 bg-slate-950 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col gap-6">
              <div className="flex items-center gap-3.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Performance Audit</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                    Provider billing and payload density
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="p-4 bg-slate-900/30 border border-white/5 rounded-2xl flex flex-col gap-2">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Heaviest Driver
                  </span>
                  <p className="text-base font-display font-bold text-white leading-tight">
                    {stats.globalModelUsage.length > 0
                      ? getModelShortName(stats.globalModelUsage[0].model)
                      : "No active drivers"}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium font-mono">
                    Consuming{" "}
                    {stats.globalModelUsage.length > 0 ? stats.globalModelUsage[0].tokens.toLocaleString() : 0} tokens
                    globally
                  </p>
                </div>

                <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex flex-col gap-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Active Models</span>
                    <span className="font-mono text-indigo-400 font-bold">{activeModelsCount} loaded</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-400"/>Input Tokens</span>
                    <span className="font-mono text-sky-400 font-bold">
                      {((stats.totalPromptTokens || 0) / 1000).toFixed(1)}k
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>Output Tokens</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {((stats.totalCompletionTokens || 0) / 1000).toFixed(1)}k
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-purple-400"/>Total Tokens</span>
                    <span className="font-mono text-purple-400 font-bold">
                      {((stats.totalTokens || 0) / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 leading-relaxed text-center font-sans font-semibold px-2">
                  Note: Values are calculated in real-time by analyzing message payloads. Prompt tokens represent
                  contexts sent; completion tokens represent replies.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "mcp" && <McpAdminTab />}

      </div>
    </div>
  );
};

export default Admin;
