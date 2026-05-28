import React, { useState, useMemo } from "react";
import { Search, Database, ChevronDown, ChevronUp, BarChart3, LayoutGrid } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import AnthropicMono from "@lobehub/icons/es/Anthropic/components/Mono";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import NvidiaColor from "@lobehub/icons/es/Nvidia/components/Color";

interface ModelUsageItem {
  model: string;
  count: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
}

const getProviderColor = (provider: string, type: 'light' | 'dark') => {
  const p = provider.toLowerCase();
  if (p === 'gemini' || p === 'google') return type === 'light' ? '#60a5fa' : '#1d4ed8';
  if (p === 'nvidia') return type === 'light' ? '#4ade80' : '#15803d';
  if (p === 'openai') return type === 'light' ? '#c084fc' : '#7e22ce';
  return type === 'light' ? '#a1a1aa' : '#3f3f46';
};

const GridProviderIcon = ({ provider, size = 16 }: { provider: string, size?: number }) => {
  const p = provider.toLowerCase();
  const mapping: Record<string, React.ComponentType<any>> = {
    gemini: GeminiColor,
    claude: AnthropicMono,
    anthropic: AnthropicMono,
    openai: OpenAIMono,
    nvidia: NvidiaColor,
    google: GeminiColor,
  };
  const Icon = mapping[p];
  if (Icon) return <Icon size={size} />;
  return (
    <div className="flex items-center justify-center bg-zinc-800 rounded-full" style={{ width: size, height: size }}>
      <span className="font-bold text-zinc-400 leading-none" style={{ fontSize: size * 0.6 }}>
        {provider ? provider.charAt(0).toUpperCase() : '?'}
      </span>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const modelName = data.modelName || label;
    return (
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-3 shadow-xl z-50">
        <p className="text-zinc-300 font-bold mb-2">{modelName}</p>
        <div className="space-y-1">
          <p className="text-sky-400 text-xs">Input: <span className="font-bold text-white ml-1">{(data.promptTokens || 0).toLocaleString()} tokens</span></p>
          <p className="text-emerald-400 text-xs">Output: <span className="font-bold text-white ml-1">{(data.completionTokens || 0).toLocaleString()} tokens</span></p>
          <div className="h-[1px] w-full bg-white/10 my-1" />
          <p className="text-zinc-400 text-xs">Total: <span className="font-bold text-white ml-1">{(data.tokens || 0).toLocaleString()} tokens</span></p>
        </div>
      </div>
    );
  }
  return null;
};

const CustomTick = (props: any) => {
  const { x, y, payload, chartData } = props;
  const entry = chartData.find((d: any) => d.model === payload.value);
  if (!entry) return null;

  const provider = entry.provider;
  const modelName = entry.modelName;

  const mapping: Record<string, React.ComponentType<any>> = {
    gemini: GeminiColor,
    claude: AnthropicMono,
    anthropic: AnthropicMono,
    openai: OpenAIMono,
    nvidia: NvidiaColor,
    google: GeminiColor,
  };
  const Icon = mapping[provider.toLowerCase()];
  
  // Exactly 2 lines
  const words = modelName.split('-');
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join('-');
  const line2 = words.slice(mid).join('-');
  const parts = line2 ? [line1, line2] : [line1];

  return (
    <g transform={`translate(${x},${y})`}>
      <g transform="translate(-10, 5)">
        {Icon ? (
          <Icon size={20} />
        ) : (
          <g>
            <circle cx={10} cy={10} r={10} fill="#27272a" />
            <text x={10} y={13.5} textAnchor="middle" fill="#a1a1aa" fontSize={11} fontWeight="bold">
              {provider ? provider.charAt(0).toUpperCase() : '?'}
            </text>
          </g>
        )}
      </g>
      <text
        x={-35}
        y={parts.length > 1 ? 3 : 11}
        textAnchor="end"
        fill="#71717a"
        fontSize={14}
        transform="rotate(-80)"
      >
        {parts.map((part: string, idx: number) => (
          <tspan key={idx} x={-35} dy={idx === 0 ? 0 : 15}>
            {part}{idx < parts.length - 1 ? '-' : ''}
          </tspan>
        ))}
      </text>
    </g>
  );
};

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
  modelUsage?: ModelUsageItem[];
}

interface UserUsageTabProps {
  users: UserStat[];
}

export default function UserUsageTab({ users }: UserUsageTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [analyzingUsers, setAnalyzingUsers] = useState<Set<string>>(new Set());

  const toggleExpand = (userId: string) => {
    const newSet = new Set(expandedUsers);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setExpandedUsers(newSet);
  };

  const toggleAnalyze = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    const newSet = new Set(analyzingUsers);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
      // Ensure it's expanded if we click analyze
      if (!expandedUsers.has(userId)) {
        const expandedSet = new Set(expandedUsers);
        expandedSet.add(userId);
        setExpandedUsers(expandedSet);
      }
    }
    setAnalyzingUsers(newSet);
  };

  const filteredUsers = useMemo(() => {
    let result = users;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = users.filter(user => {
        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
        const email = user.email.toLowerCase();
        
        // Match by user name or email
        if (fullName.includes(query) || email.includes(query)) {
          return true;
        }
        
        // Match by any model name they have used
        if (user.modelUsage) {
          return user.modelUsage.some(m => m.model.toLowerCase().includes(query));
        }
        
        return false;
      });
    }

    return [...result].sort((a, b) => b.totalTokens - a.totalTokens);
  }, [users, searchQuery]);

  return (
    <div className="animate-in fade-in space-y-6">
      <div className="bg-zinc-950 border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Token Usage Breakdown</h2>
              <p className="text-xs text-zinc-500 font-medium">Detailed model consumption per user</p>
            </div>
          </div>
          
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="Search user or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 text-sm text-white rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-sky-500/50 transition-colors placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="space-y-4">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
              <Database className="mx-auto h-8 w-8 text-zinc-600 mb-3" />
              <p className="text-sm font-medium text-zinc-400">No users found matching your search.</p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isExpanded = expandedUsers.has(user.clerkId);
              
              return (
                <div key={user.clerkId} className="border border-white/5 rounded-2xl bg-zinc-900/30 overflow-hidden transition-all duration-200 hover:border-white/10">
                  <div 
                    className="p-4 sm:p-5 flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleExpand(user.clerkId)}
                  >
                    <div className="flex items-center gap-4">
                      {user.imageUrl ? (
                        <img src={user.imageUrl} alt={user.firstName || "User"} className="h-10 w-10 rounded-full border border-white/10 object-cover shadow-sm" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/5 flex items-center justify-center shadow-sm">
                          <span className="text-sm font-bold text-zinc-400">{(user.firstName?.[0] || user.email[0]).toUpperCase()}</span>
                        </div>
                      )}
                      
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-tight">
                          {user.firstName} {user.lastName}
                        </h3>
                        <p className="text-xs text-zinc-500 font-medium truncate max-w-[200px] sm:max-w-xs">{user.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="hidden sm:block text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Total Tokens</p>
                        <p className="font-mono text-sm font-bold text-sky-400">
                          {user.totalTokens.toLocaleString()}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => toggleAnalyze(e, user.clerkId)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${analyzingUsers.has(user.clerkId) ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'}`}
                      >
                        {analyzingUsers.has(user.clerkId) ? <LayoutGrid size={14} /> : <BarChart3 size={14} />}
                        <span className="hidden sm:inline">{analyzingUsers.has(user.clerkId) ? "Grid" : "Analyze"}</span>
                      </button>
                      <div className="text-zinc-500 hover:text-white transition-colors p-1 bg-white/5 rounded-full">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-white/5 bg-zinc-950/50 p-4 sm:p-6 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                          <Database size={12} />
                          Model Breakdown
                        </h4>
                      </div>
                      
                      {!user.modelUsage || user.modelUsage.length === 0 ? (
                        <p className="text-xs text-zinc-500 italic">No model usage recorded for this user.</p>
                      ) : analyzingUsers.has(user.clerkId) ? (
                        (() => {
                          const chartData = user.modelUsage.map((u) => {
                            const delimiter = u.model.includes(':') ? ':' : '/';
                            const parts = u.model.split(delimiter);
                            const provider = parts.length > 1 ? parts[0] : 'unknown';
                            const modelName = parts.length > 1 ? parts.slice(1).join(delimiter) : u.model;
                            return { ...u, provider, modelName };
                          });
                          
                          return (
                            <div className="w-full bg-zinc-900/50 rounded-xl p-4 border border-white/5 space-y-4">
                              <div className="h-[520px] w-full [&_*]:!outline-none [&_*]:!ring-0 focus:outline-none">
                                <ResponsiveContainer width="100%" height="100%" className="focus:outline-none" style={{ outline: 'none' }}>
                                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }} style={{ outline: 'none' }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis 
                                      dataKey="model" 
                                      tick={(props) => <CustomTick {...props} chartData={chartData} />}
                                      axisLine={false}
                                      tickLine={false}
                                      height={160}
                                      interval={0}
                                    />
                                    <YAxis 
                                      tickFormatter={(val) => val.toLocaleString()}
                                      tick={{ fontSize: 12, fill: "#71717a" }}
                                      axisLine={false}
                                      tickLine={false}
                                      width={80}
                                    />
                                    <Tooltip 
                                      cursor={{ fill: '#ffffff05' }}
                                      content={<CustomTooltip />}
                                    />
                                    <Bar dataKey="promptTokens" name="Input Tokens" stackId="a" maxBarSize={60}>
                                      {chartData.map((entry, index) => (
                                        <Cell key={`cell-in-${index}`} fill={getProviderColor(entry.provider, 'light')} />
                                      ))}
                                    </Bar>
                                    <Bar dataKey="completionTokens" name="Output Tokens" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={60}>
                                      {chartData.map((entry, index) => (
                                        <Cell key={`cell-out-${index}`} fill={getProviderColor(entry.provider, 'dark')} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {user.modelUsage.map((usage, idx) => {
                            const delimiter = usage.model.includes(':') ? ':' : '/';
                            const parts = usage.model.split(delimiter);
                            const provider = parts.length > 1 ? parts[0] : 'unknown';
                            const modelName = parts.length > 1 ? parts.slice(1).join(delimiter) : usage.model;
                            
                            return (
                              <div key={idx} className="bg-zinc-900 border border-white/5 rounded-xl p-4 flex flex-col justify-between hover:border-white/10 transition-colors relative">
                                <div className="absolute top-4 right-4">
                                  <GridProviderIcon provider={provider} size={18} />
                                </div>
                                <div className="mb-3 pr-6">
                                  <p className="text-xs font-bold text-zinc-200 truncate" title={modelName}>
                                    {modelName}
                                  </p>
                                  <p className="text-[10px] font-medium text-zinc-500 mt-0.5">{usage.count.toLocaleString()} messages</p>
                                </div>
                              
                              <div>
                                <div className="flex justify-between items-end mb-1">
                                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Total</span>
                                  <span className="font-mono text-sm font-bold text-white">{usage.tokens.toLocaleString()}</span>
                                </div>
                                <div className="h-[1px] w-full bg-white/5 my-2" />
                                <div className="flex justify-between items-center text-[10px] font-mono mt-1">
                                  <span className="text-sky-400/80 flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0"/>
                                    In: {usage.promptTokens.toLocaleString()}
                                  </span>
                                  <span className="text-emerald-400/80 flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"/>
                                    Out: {usage.completionTokens.toLocaleString()}
                                  </span>
                                </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
