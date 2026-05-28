import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Server, ToggleLeft, ToggleRight, CheckCircle2, XCircle } from "lucide-react";

interface AppConfig {
  disabledProviders: string[];
  disabledModels: string[];
}

interface ProviderConfigInfo {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

export default function AccessControlTab() {
  const [config, setConfig] = useState<AppConfig>({ disabledProviders: [], disabledModels: [] });
  const [providers, setProviders] = useState<ProviderConfigInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await api.get("/admin/config");
      setConfig(response.data.config);
      setProviders(response.data.allProviders);
    } catch (error) {
      console.error("Failed to fetch config:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (newConfig: AppConfig) => {
    setSaving(true);
    setConfig(newConfig); // Optimistic update
    try {
      await api.patch("/admin/config", newConfig);
    } catch (error) {
      console.error("Failed to update config:", error);
      fetchConfig(); // Revert on failure
    } finally {
      setSaving(false);
    }
  };

  const toggleProvider = (providerId: string) => {
    const disabledProviders = config.disabledProviders.includes(providerId)
      ? config.disabledProviders.filter((id) => id !== providerId)
      : [...config.disabledProviders, providerId];
    updateConfig({ ...config, disabledProviders });
  };

  const toggleModel = (modelId: string) => {
    const disabledModels = config.disabledModels.includes(modelId)
      ? config.disabledModels.filter((id) => id !== modelId)
      : [...config.disabledModels, modelId];
    updateConfig({ ...config, disabledModels });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse flex items-center gap-2 text-zinc-500 font-mono text-sm uppercase tracking-widest">
          <Server size={14} className="animate-spin" />
          Loading Configuration...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 md:p-8 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <div className="relative z-10 flex flex-col gap-2">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <Server className="text-indigo-400" />
            Provider & Model Access Control
          </h2>
          <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
            Toggle global access to AI providers or specific models. Disabled models will be immediately hidden from the user interface and their API endpoints will be blocked at the backend.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {providers.map((provider) => {
          const isProviderDisabled = config.disabledProviders.includes(provider.id);
          return (
            <div
              key={provider.id}
              className={`bg-zinc-950 border transition-all duration-300 rounded-3xl overflow-hidden flex flex-col ${isProviderDisabled ? "border-rose-500/20 opacity-80" : "border-white/10 hover:border-indigo-500/30"
                }`}
            >
              <div className={`p-5 flex items-center justify-between border-b ${isProviderDisabled ? "border-rose-500/10 bg-rose-500/5" : "border-white/5 bg-white/5"
                }`}>
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {provider.name}
                    {isProviderDisabled ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] uppercase tracking-widest font-black border border-rose-500/20">
                        Disabled globally
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] uppercase tracking-widest font-black border border-emerald-500/20">
                        Active
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono">ID: {provider.id}</p>
                </div>
                <button
                  onClick={() => toggleProvider(provider.id)}
                  disabled={saving}
                  className={`transition-colors duration-300 ${isProviderDisabled ? "text-rose-500 hover:text-rose-400" : "text-emerald-500 hover:text-emerald-400"} disabled:opacity-50`}
                >
                  {isProviderDisabled ? <ToggleLeft size={32} strokeWidth={1.5} /> : <ToggleRight size={32} strokeWidth={1.5} />}
                </button>
              </div>

              <div className="p-2 flex flex-col gap-1">
                {provider.models.map((model) => {
                  const isModelDisabled = config.disabledModels.includes(model.id);
                  const isEffectivelyDisabled = isProviderDisabled || isModelDisabled;

                  return (
                    <div
                      key={model.id}
                      className={`flex items-center justify-between p-3 rounded-2xl transition-all ${isEffectivelyDisabled
                        ? "bg-zinc-900/30 text-zinc-500"
                        : "bg-transparent text-zinc-300 hover:bg-white/5"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isEffectivelyDisabled ? (
                          <XCircle size={16} className="text-rose-500/50 shrink-0" />
                        ) : (
                          <CheckCircle2 size={16} className="text-emerald-500/50 shrink-0" />
                        )}
                        <span className="text-sm font-medium font-mono truncate">{model.name}</span>
                      </div>

                      <button
                        onClick={() => toggleModel(model.id)}
                        disabled={saving || isProviderDisabled}
                        className={`shrink-0 transition-colors duration-300 ${isEffectivelyDisabled ? "text-rose-500/50 hover:text-rose-400" : "text-indigo-500 hover:text-indigo-400"
                          } disabled:cursor-not-allowed`}
                      >
                        {isModelDisabled ? <ToggleLeft size={24} strokeWidth={1.5} /> : <ToggleRight size={24} strokeWidth={1.5} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
