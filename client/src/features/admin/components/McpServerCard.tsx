import {
  Activity,
  ChevronDown,
  Globe,
  Loader2,
  Power,
  Server as ServerIcon,
  Sliders,
  Terminal,
  Trash2,
  Wrench
} from "lucide-react";
import type { McpServerConfig, McpTool, McpToolProperty } from "@/features/admin/types/mcp.types";

interface McpServerCardProps {
  server: McpServerConfig;
  tools: McpTool[];
  isExpanded: boolean;
  envVisible: boolean;
  isActionLoading: boolean;
  onDelete: (name: string) => void;
  onEdit: (server: McpServerConfig) => void;
  onToggleEnv: (name: string) => void;
  onToggleExpand: (name: string) => void;
  onToggleServer: (name: string, enabled: boolean) => void;
}

const getDisplayName = (name: string) => name.replace(/[-_]/g, " ");

const getStatusMeta = (server: McpServerConfig) => {
  if (!server.enabled) {
    return {
      label: "Disabled",
      detail: "Stopped",
      dotClass: "bg-slate-600",
      badgeClass: "border-slate-700/70 bg-slate-800/70 text-slate-400"
    };
  }

  if (server.connected === false) {
    return {
      label: "Enabled",
      detail: "Waiting",
      dotClass: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.45)]",
      badgeClass: "border-amber-400/20 bg-amber-400/10 text-amber-300"
    };
  }

  return {
    label: "Connected",
    detail: "Online",
    dotClass: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]",
    badgeClass: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
  };
};

const ConfigRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3">
    <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
    <span className="mt-1 block break-all font-mono text-xs font-semibold leading-relaxed text-slate-200">
      {value || "Not configured"}
    </span>
  </div>
);

const ParameterBadge = ({
  name,
  property,
  required
}: {
  name: string;
  property: McpToolProperty;
  required: boolean;
}) => (
  <span
    className={`rounded-md border px-2 py-1 font-mono text-[10px] ${
      required
        ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
        : "border-white/5 bg-slate-950/70 text-slate-400"
    }`}
    title={`${name}: ${property.type || "any"}${required ? " (required)" : ""}${property.description ? ` - ${property.description}` : ""}`}
  >
    {name}
    {required ? "*" : ""}
    <span className="ml-1 text-slate-500">({property.type || "any"})</span>
  </span>
);

const ToolCard = ({ tool }: { tool: McpTool }) => {
  const properties = tool.inputSchema?.properties ?? {};
  const requiredFields = tool.inputSchema?.required ?? [];
  const parameterEntries = Object.entries(properties);

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3 transition hover:border-sky-400/20">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
          <Wrench size={14} />
        </span>
        <span className="block truncate font-mono text-xs font-bold text-white">{tool.name}</span>
      </div>

      {tool.description && (
        <p className="mt-2 line-clamp-3 text-[11px] font-medium leading-relaxed text-slate-400">
          {tool.description}
        </p>
      )}

      {parameterEntries.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Parameters
          </span>
          <div className="flex flex-wrap gap-1.5">
            {parameterEntries.map(([name, property]) => (
              <ParameterBadge
                key={name}
                name={name}
                property={property}
                required={requiredFields.includes(name)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const McpServerCard = ({
  server,
  tools,
  isExpanded,
  envVisible,
  isActionLoading,
  onDelete,
  onEdit,
  onToggleEnv,
  onToggleExpand,
  onToggleServer
}: McpServerCardProps) => {
  const status = getStatusMeta(server);
  const args = Array.isArray(server.args) ? server.args : [];
  const envEntries = server.env ? Object.entries(server.env) : [];
  const TransportIcon = server.type === "stdio" ? Terminal : Globe;

  return (
    <article className="rounded-lg border border-white/5 bg-slate-950/70 shadow-xl shadow-black/10 transition hover:border-white/10">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${
              server.type === "stdio"
                ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
            }`}
          >
            <TransportIcon size={18} />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate text-sm font-bold capitalize text-white">{getDisplayName(server.name)}</h4>
              <span className={`h-2 w-2 rounded-full ${status.dotClass}`} />
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${status.badgeClass}`}>
                {status.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <span>{server.type} transport</span>
              <span>/</span>
              <span>{tools.length} tools</span>
              <span>/</span>
              <span>{status.detail}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={() => onToggleServer(server.name, !server.enabled)}
            disabled={isActionLoading}
            className={`relative inline-flex h-7 w-12 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
              server.enabled ? "border-emerald-400/30 bg-emerald-500/80" : "border-white/10 bg-slate-800"
            }`}
            aria-label={`${server.enabled ? "Disable" : "Enable"} ${server.name}`}
            title={`${server.enabled ? "Disable" : "Enable"} server`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-900 shadow transition ${
                server.enabled ? "translate-x-5" : "translate-x-1"
              }`}
            >
              {isActionLoading ? <Loader2 size={11} className="animate-spin" /> : <Power size={11} />}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onEdit(server)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/5 bg-white/5 text-slate-400 transition hover:border-sky-400/20 hover:bg-sky-400/10 hover:text-sky-300"
            aria-label={`Edit ${server.name}`}
            title="Edit configuration"
          >
            <Sliders size={15} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(server.name)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/5 bg-white/5 text-slate-400 transition hover:border-rose-400/20 hover:bg-rose-400/10 hover:text-rose-300"
            aria-label={`Delete ${server.name}`}
            title="Delete integration"
          >
            <Trash2 size={15} />
          </button>

          <button
            type="button"
            onClick={() => onToggleExpand(server.name)}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:border-white/10 hover:bg-white/10 hover:text-white"
            aria-expanded={isExpanded}
          >
            <span>{isExpanded ? "Hide" : "Details"}</span>
            <ChevronDown size={14} className={`transition ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-white/5 p-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <ServerIcon size={13} className="text-sky-300" />
                <span>Configuration</span>
              </div>

              {server.type === "stdio" ? (
                <>
                  <ConfigRow label="Command" value={server.command || ""} />
                  <ConfigRow label="Arguments" value={args.length > 0 ? args.join(" ") : ""} />
                </>
              ) : (
                <ConfigRow label="SSE Endpoint" value={server.url || ""} />
              )}

              {envEntries.length > 0 && (
                <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Environment
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleEnv(server.name)}
                      className="text-[10px] font-bold uppercase tracking-widest text-sky-300 transition hover:text-sky-200"
                    >
                      {envVisible ? "Hide" : "Show"}
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {envEntries.map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 text-xs last:border-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate font-mono font-bold text-slate-400">{key}</span>
                        <span className="max-w-[55%] truncate text-right font-mono font-semibold text-slate-300">
                          {envVisible ? String(value) : "********"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Activity size={13} className="text-emerald-300" />
                  <span>Exposed Tools</span>
                </div>
                <span className="rounded-md border border-white/5 bg-white/5 px-2 py-1 font-mono text-[10px] font-bold text-slate-300">
                  {tools.length}
                </span>
              </div>

              {tools.length === 0 ? (
                <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-slate-900/20 p-6 text-center">
                  <Wrench size={20} className="mb-2 text-slate-700" />
                  <p className="max-w-sm text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    No active tools loaded for this server.
                  </p>
                </div>
              ) : (
                <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                  {tools.map((tool) => (
                    <ToolCard key={`${server.name}-${tool.name}`} tool={tool} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
};

export default McpServerCard;
