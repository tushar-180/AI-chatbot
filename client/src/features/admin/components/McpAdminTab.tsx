import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Activity, Cpu, Database, Loader2, Plus, RefreshCw, Server, Sliders } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import McpServerCard from "@/features/admin/components/McpServerCard";
import McpServerModal from "@/features/admin/components/McpServerModal";
import type {
  McpServerConfig,
  McpServerFormState,
  McpTool,
  McpTransport
} from "@/features/admin/types/mcp.types";

const createEmptyForm = (): McpServerFormState => ({
  serverName: "",
  serverType: "stdio",
  command: "",
  argsString: "",
  sseUrl: "",
  envString: ""
});

const getApiError = (error: unknown, fallback: string) => {
  const apiError = error as { response?: { data?: { error?: string } } };
  return apiError.response?.data?.error || fallback;
};

const MetricTile = ({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: typeof Server;
  label: string;
  value: string | number;
  tone: "sky" | "emerald" | "indigo";
}) => {
  const toneClass = {
    sky: "border-sky-400/15 bg-sky-400/5 text-sky-300",
    emerald: "border-emerald-400/15 bg-emerald-400/5 text-emerald-300",
    indigo: "border-indigo-400/15 bg-indigo-400/5 text-indigo-300"
  }[tone];

  return (
    <div className="rounded-lg border border-white/5 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-2 font-mono text-2xl font-black leading-none text-white">{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>
          <Icon size={17} />
        </span>
      </div>
    </div>
  );
};

const McpAdminTab = () => {
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [activeTools, setActiveTools] = useState<McpTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionServerName, setActionServerName] = useState<string | null>(null);
  const [expandedServerName, setExpandedServerName] = useState<string | null>(null);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<McpServerFormState>(createEmptyForm);
  const [visibleEnvByServer, setVisibleEnvByServer] = useState<Record<string, boolean>>({});

  const fetchMcpData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [serversRes, toolsRes] = await Promise.all([
        api.get<McpServerConfig[]>("/mcp"),
        api.get<{ tools: McpTool[] }>("/mcp/tools")
      ]);

      setMcpServers(serversRes.data || []);
      setActiveTools(toolsRes.data.tools || []);
    } catch (error) {
      console.error("Failed to load MCP telemetry:", error);
      toast.error(getApiError(error, "Failed to load MCP servers"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMcpData();
  }, [fetchMcpData]);

  const toolsByServer = useMemo(() => {
    return activeTools.reduce<Record<string, McpTool[]>>((acc, tool) => {
      if (!tool._serverName) return acc;
      acc[tool._serverName] = [...(acc[tool._serverName] || []), tool];
      return acc;
    }, {});
  }, [activeTools]);

  const enabledServers = useMemo(() => mcpServers.filter((server) => server.enabled).length, [mcpServers]);
  const connectedServers = useMemo(
    () => mcpServers.filter((server) => server.enabled && server.connected !== false).length,
    [mcpServers]
  );

  const handleFormChange = <K extends keyof McpServerFormState,>(
    field: K,
    value: McpServerFormState[K]
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingServerName(null);
    setForm(createEmptyForm());
  };

  const handleOpenRegister = () => {
    setEditingServerName(null);
    setForm(createEmptyForm());
    setIsModalOpen(true);
  };

  const handleEditServer = (server: McpServerConfig) => {
    setEditingServerName(server.name);
    setForm({
      serverName: server.name,
      serverType: (server.type === "sse" ? "sse" : "stdio") as McpTransport,
      command: server.command || "",
      argsString: Array.isArray(server.args) ? server.args.join(", ") : "",
      sseUrl: server.url || "",
      envString: server.env && Object.keys(server.env).length > 0 ? JSON.stringify(server.env, null, 2) : ""
    });
    setIsModalOpen(true);
  };

  const handleSubmitServer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.serverName.trim()) {
      toast.error("Server name is required.");
      return;
    }

    let parsedEnv: Record<string, unknown> = {};
    if (form.envString.trim()) {
      try {
        const parsed = JSON.parse(form.envString);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error("Environment variables must be a JSON object.");
          return;
        }
        parsedEnv = parsed as Record<string, unknown>;
      } catch {
        toast.error("Environment variables must be valid JSON.");
        return;
      }
    }

    const payload =
      form.serverType === "stdio"
        ? {
            name: form.serverName.trim(),
            type: form.serverType,
            command: form.command.trim(),
            args: form.argsString
              .split(",")
              .map((arg) => arg.trim())
              .filter(Boolean),
            env: parsedEnv
          }
        : {
            name: form.serverName.trim(),
            type: form.serverType,
            url: form.sseUrl.trim(),
            env: parsedEnv
          };

    try {
      setIsSaving(true);
      await api.post("/mcp", payload);
      toast.success(editingServerName ? "MCP server configuration updated" : "MCP server registered");
      await fetchMcpData();
      closeModal();
    } catch (error) {
      console.error("Failed to register/update server:", error);
      toast.error(getApiError(error, "Failed to save server configuration"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleServer = async (name: string, enabled: boolean) => {
    try {
      setActionServerName(name);
      setMcpServers((current) =>
        current.map((server) =>
          server.name === name ? { ...server, enabled, connected: enabled ? server.connected : false } : server
        )
      );

      await api.patch(`/mcp/${name}/toggle`, { enabled });
      toast.success(`Server "${name}" ${enabled ? "enabled" : "disabled"}`);
      await fetchMcpData();
    } catch (error) {
      console.error("Failed to toggle server:", error);
      toast.error(getApiError(error, "Failed to toggle server state"));
      await fetchMcpData();
    } finally {
      setActionServerName(null);
    }
  };

  const handleDeleteServer = async (name: string) => {
    if (!window.confirm(`Permanently delete MCP server "${name}"?`)) {
      return;
    }

    try {
      setActionServerName(name);
      await api.delete(`/mcp/${name}`);
      toast.success(`Server "${name}" deleted`);
      if (expandedServerName === name) setExpandedServerName(null);
      await fetchMcpData();
    } catch (error) {
      console.error("Failed to delete server:", error);
      toast.error(getApiError(error, "Failed to delete server"));
    } finally {
      setActionServerName(null);
    }
  };

  const handleToggleExpand = (name: string) => {
    setExpandedServerName((current) => (current === name ? null : name));
  };

  const handleToggleEnv = (name: string) => {
    setVisibleEnvByServer((current) => ({ ...current, [name]: !current[name] }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-5 border-b border-white/5 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-sky-300">
              <Sliders size={20} />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">MCP Registry</h2>
              <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-slate-400">
                Manage local stdio servers, remote SSE integrations, and the tools currently exposed to chat models.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchMcpData()}
              disabled={isLoading}
              className="flex h-10 items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 text-xs font-bold uppercase tracking-widest text-slate-300 transition hover:border-white/10 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleOpenRegister}
              className="flex h-10 items-center gap-2 rounded-lg bg-sky-500 px-4 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-sky-400"
            >
              <Plus size={15} />
              <span>Register</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricTile icon={Server} label="Configured" value={mcpServers.length} tone="sky" />
          <MetricTile icon={Activity} label="Connected" value={`${connectedServers}/${enabledServers}`} tone="emerald" />
          <MetricTile icon={Database} label="Active Tools" value={activeTools.length} tone="indigo" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-white">Configured Servers</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {mcpServers.length === 0 ? "No servers in the registry yet." : "Expand a server to inspect configuration and tool schemas."}
            </p>
          </div>
          {isLoading && mcpServers.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Loader2 size={12} className="animate-spin" />
              Syncing
            </span>
          )}
        </div>

        {isLoading && mcpServers.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-white/5 bg-slate-950/50 p-8 text-center">
            <Loader2 size={24} className="mb-3 animate-spin text-sky-300" />
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Syncing MCP registry</p>
          </div>
        ) : mcpServers.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-slate-950/30 p-8 text-center">
            <Cpu size={30} className="mb-4 text-slate-700" />
            <h4 className="text-sm font-bold text-white">No MCP servers registered</h4>
            <p className="mt-2 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
              Register a command or SSE endpoint to make external tools available to supported models.
            </p>
            <button
              type="button"
              onClick={handleOpenRegister}
              className="mt-5 flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-sky-400"
            >
              <Plus size={15} />
              <span>Register Server</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {mcpServers.map((server) => (
              <McpServerCard
                key={server.name}
                server={server}
                tools={toolsByServer[server.name] || []}
                isExpanded={expandedServerName === server.name}
                envVisible={!!visibleEnvByServer[server.name]}
                isActionLoading={actionServerName === server.name}
                onDelete={handleDeleteServer}
                onEdit={handleEditServer}
                onToggleEnv={handleToggleEnv}
                onToggleExpand={handleToggleExpand}
                onToggleServer={handleToggleServer}
              />
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <McpServerModal
          editingServerName={editingServerName}
          form={form}
          isSaving={isSaving}
          onClose={closeModal}
          onFormChange={handleFormChange}
          onSubmit={handleSubmitServer}
        />
      )}
    </div>
  );
};

export default McpAdminTab;
