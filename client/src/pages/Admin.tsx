import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/react";
import Loading from "@/features/chat/components/Loading";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  User as UserIcon,
  MessageSquare,
  Sparkles,
  Cpu,
  Search,
  ChevronUp,
  ChevronDown,
  Brain,
  Activity,
  UserCheck,
  BarChart3
} from "lucide-react";
import { toast } from "sonner";

interface GlobalModelUse {
  model: string;
  count: number;
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
}

interface AdminStats {
  totalUsersCount: number;
  totalChatsCount: number;
  globalModelUsage: GlobalModelUse[];
  usersList: UserStat[];
}

const Admin: React.FC = () => {
  const { user: currentUser } = useUser();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<"name" | "chats" | "joined">("chats");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const handleRoleChange = async (targetClerkId: string, newRole: "user" | "admin") => {
    try {
      // Optimistically update the UI role to be snappy
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

      // Revert local state by querying latest stats
      const { data } = await api.get("/admin/stats");
      setStats(data);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const { data } = await api.get("/admin/stats");
        setStats(data);
      } catch (err: any) {
        console.error("Failed to load admin stats:", err);
        const errorMsg = err?.response?.data?.error || "Unauthorized. Admin role required.";
        toast.error(errorMsg);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  // Filter and Sort Users list
  const filteredAndSortedUsers = useMemo(() => {
    if (!stats) return [];
    
    let result = [...stats.usersList];

    // 1. Search Query filter
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        u =>
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
      }

      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [stats, searchQuery, sortField, sortAsc]);

  const handleSort = (field: "name" | "chats" | "joined") => {
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
    return "bg-sky-500/10 text-sky-400 border-sky-500/20";
  };

  const getModelShortName = (model: string) => {
    if (model === "None") return "No messages";
    return model.split("/").pop() || model;
  };

  if (loading) {
    return <Loading message="Securing Connection..." />;
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center gap-6 p-4 text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-rose-500/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="p-6 bg-slate-900/40 backdrop-blur-2xl border border-rose-500/20 rounded-3xl max-w-md shadow-2xl">
          <Brain className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            You do not have the required administrative permissions to access the Velora analytics dashboard. Please sign in with an administrator account.
          </p>
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-3.5 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all shadow-xl shadow-black/20"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            <span>Return to Chat</span>
          </Link>
        </div>
      </div>
    );
  }

  // Get highest used model globally
  const topModel = stats.globalModelUsage.length > 0 ? stats.globalModelUsage[0].model : "N/A";
  const activeModelsCount = stats.globalModelUsage.length;

  return (
    <div className="min-h-screen bg-[#030712] text-slate-200 flex flex-col relative overflow-x-hidden p-6 md:p-12">
      {/* Background glow animations */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-7xl w-full mx-auto flex flex-col gap-10 relative z-10">
        
        {/* Upper Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/20">
                Core Engine
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-widest">Live stats</span>
            </div>
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Admin Dashboard</h1>
            <p className="text-xs text-slate-500 font-medium">System intelligence, active model usages, and participant insights</p>
          </div>

          <Link
            to="/chat"
            className="self-start md:self-center flex items-center gap-2 bg-slate-900 border border-white/5 hover:border-white/10 px-5 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-all shadow-xl"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            <span>Back to Workspace</span>
          </Link>
        </div>

        {/* Analytics Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1: Users */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-white/10 hover:bg-slate-900/60 transition-all flex items-center justify-between shadow-2xl hover:scale-[1.02] duration-300 group">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total Users</p>
              <h3 className="text-3xl font-display font-bold text-white leading-none group-hover:text-indigo-400 transition-colors">
                {stats.totalUsersCount}
              </h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
              <UserIcon size={20} />
            </div>
          </div>

          {/* Card 2: Total Platform Chats */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-white/10 hover:bg-slate-900/60 transition-all flex items-center justify-between shadow-2xl hover:scale-[1.02] duration-300 group">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total Chats</p>
              <h3 className="text-3xl font-display font-bold text-white leading-none group-hover:text-sky-400 transition-colors">
                {stats.totalChatsCount}
              </h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
              <MessageSquare size={20} />
            </div>
          </div>

          {/* Card 3: Top Model */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-white/10 hover:bg-slate-900/60 transition-all flex items-center justify-between shadow-2xl hover:scale-[1.02] duration-300 group">
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Global Top Model</p>
              <h3 className="text-xl font-display font-bold text-white leading-tight truncate group-hover:text-purple-400 transition-colors pr-2">
                {getModelShortName(topModel)}
              </h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0 group-hover:scale-110 transition-transform">
              <Sparkles size={20} />
            </div>
          </div>

          {/* Card 4: Active Models */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-6 rounded-3xl hover:border-white/10 hover:bg-slate-900/60 transition-all flex items-center justify-between shadow-2xl hover:scale-[1.02] duration-300 group">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Active Models</p>
              <h3 className="text-3xl font-display font-bold text-white leading-none group-hover:text-emerald-400 transition-colors">
                {activeModelsCount}
              </h3>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Cpu size={20} />
            </div>
          </div>

        </div>

        {/* Global Model Usage & User Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Column 1: Model Usage Graph (1 Span) */}
          <div className="lg:col-span-1 bg-slate-950 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <BarChart3 size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Model Usage Shares</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Relative platform volume</p>
              </div>
            </div>

            {stats.globalModelUsage.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/5 rounded-2xl">
                <Activity size={24} className="text-slate-700 mb-2" />
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600">No models active yet</p>
              </div>
            ) : (
              <div className="space-y-5 flex-1 justify-center flex flex-col">
                {stats.globalModelUsage.map((m) => {
                  const totalCountsSum = stats.globalModelUsage.reduce((sum, item) => sum + item.count, 0);
                  const percentage = totalCountsSum > 0 
                    ? Math.round((m.count / totalCountsSum) * 100) 
                    : 0;

                  return (
                    <div key={m.model} className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-300 truncate max-w-[180px]">{getModelShortName(m.model)}</span>
                        <span className="font-mono text-slate-500">{m.count} msgs ({percentage}%)</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${
                            m.model.toLowerCase().includes("gemini")
                              ? "bg-gradient-to-r from-purple-500 to-indigo-500"
                              : m.model.toLowerCase().includes("nvidia") || m.model.toLowerCase().includes("nemotron")
                              ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                              : "bg-gradient-to-r from-sky-500 to-blue-500"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column 2: User Activity Directory (2 Spans) */}
          <div className="lg:col-span-2 bg-slate-950 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col gap-6">
            
            {/* Table Header Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <UserCheck size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">User Directory</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Active profiles & performance stats</p>
                </div>
              </div>

              {/* Search Bar input */}
              <div className="relative group max-w-xs w-full">
                <input
                  type="text"
                  placeholder="Filter users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-white/5 rounded-2xl py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-white/10 transition-all"
                />
                <Search size={14} className="absolute left-3.5 top-3 text-slate-500 group-focus-within:text-white transition-colors" />
              </div>
            </div>

            {/* Responsive User Table */}
            <div className="overflow-x-auto min-h-0 flex-1">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="pb-3 cursor-pointer select-none hover:text-white transition-colors" onClick={() => handleSort("name")}>
                      <div className="flex items-center gap-1.5">
                        <span>User</span>
                        {sortField === "name" && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </div>
                    </th>
                    <th className="pb-3 hidden sm:table-cell cursor-pointer select-none hover:text-white transition-colors" onClick={() => handleSort("joined")}>
                      <div className="flex items-center gap-1.5">
                        <span>Joined</span>
                        {sortField === "joined" && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </div>
                    </th>
                    <th className="pb-3 text-right cursor-pointer select-none hover:text-white transition-colors" onClick={() => handleSort("chats")}>
                      <div className="flex items-center gap-1.5 justify-end">
                        <span>Chats</span>
                        {sortField === "chats" && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </div>
                    </th>
                    <th className="pb-3 text-right">Fav Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAndSortedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-600 text-xs font-semibold uppercase tracking-widest">
                        No matches found
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedUsers.map((u) => {
                      const joinedDate = new Date(u.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      });

                      const totalContribution = stats.totalChatsCount > 0
                        ? Math.round((u.totalChats / stats.totalChatsCount) * 100)
                        : 0;

                      return (
                        <tr key={u.clerkId} className="group hover:bg-white/1 transition-all">
                          <td className="py-4 pr-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl overflow-hidden border border-white/5 shadow-inner shrink-0">
                                {u.imageUrl ? (
                                  <img src={u.imageUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full bg-slate-800 flex items-center justify-center">
                                    <UserIcon size={14} className="text-slate-500" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate leading-tight flex items-center gap-2">
                                  <span>{`${u.firstName || ""} ${u.lastName || ""}`.trim() || "User"}</span>
                                  <select
                                    value={u.role}
                                    disabled={u.clerkId === currentUser?.id}
                                    onChange={(e) => handleRoleChange(u.clerkId, e.target.value as "user" | "admin")}
                                    className={`bg-slate-900 border border-white/5 hover:border-white/10 rounded-lg px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest focus:outline-none focus:border-indigo-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                                      u.role === "admin" ? "text-emerald-400" : "text-slate-400"
                                    }`}
                                  >
                                    <option value="user" className="bg-slate-950 text-slate-400 text-[10px] font-bold">User</option>
                                    <option value="admin" className="bg-slate-950 text-emerald-400 text-[10px] font-bold">Admin</option>
                                  </select>
                                </p>
                                <p className="text-[10px] text-slate-500 truncate mt-0.5">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 hidden sm:table-cell text-xs text-slate-400">
                            {joinedDate}
                          </td>
                          <td className="py-4 text-right pr-3">
                            <span className="text-sm font-semibold text-white font-mono">{u.totalChats}</span>
                            <p className="text-[9px] text-slate-500 font-medium font-mono">{totalContribution}% contribution</p>
                          </td>
                          <td className="py-4 text-right">
                            <span className={`inline-block px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase tracking-wider border ${getModelBadgeClass(u.favoriteModel)}`}>
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

        </div>

      </div>
    </div>
  );
};

export default Admin;
