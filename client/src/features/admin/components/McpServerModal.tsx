import type { FormEvent } from "react";
import { Globe, Loader2, Terminal, X } from "lucide-react";
import type { McpServerFormState, McpTransport } from "@/features/admin/types/mcp.types";

interface McpServerModalProps {
  editingServerName: string | null;
  form: McpServerFormState;
  isSaving: boolean;
  onClose: () => void;
  onFormChange: <K extends keyof McpServerFormState>(field: K, value: McpServerFormState[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-slate-900/90 px-3.5 py-3 text-xs text-white outline-none transition-all placeholder:text-slate-600 focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/10 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "block text-[10px] font-bold uppercase tracking-widest text-slate-400";

const transportOptions: Array<{
  value: McpTransport;
  label: string;
  description: string;
  icon: typeof Terminal;
}> = [
  {
    value: "stdio",
    label: "STDIO",
    description: "Local command",
    icon: Terminal
  },
  {
    value: "sse",
    label: "SSE",
    description: "Remote endpoint",
    icon: Globe
  }
];

const McpServerModal = ({
  editingServerName,
  form,
  isSaving,
  onClose,
  onFormChange,
  onSubmit
}: McpServerModalProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <button
        type="button"
        aria-label="Close MCP server modal"
        className="absolute inset-0 cursor-default bg-slate-950/80 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <h3 className="text-base font-bold tracking-tight text-white">
              {editingServerName ? "Edit MCP Server" : "Register MCP Server"}
            </h3>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {editingServerName ? "Update transport settings and environment values." : "Add a local command or SSE endpoint to the registry."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-white/5 text-slate-400 transition hover:border-white/10 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="max-h-[76vh] overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className={labelClass} htmlFor="mcp-server-name">
                Server Name
              </label>
              <input
                id="mcp-server-name"
                type="text"
                placeholder="sqlite"
                value={form.serverName}
                onChange={(event) => onFormChange("serverName", event.target.value)}
                required
                disabled={!!editingServerName}
                className={fieldClass}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <span className={labelClass}>Transport Protocol</span>
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-white/5 bg-slate-900/50 p-1.5 sm:grid-cols-2">
                {transportOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = form.serverType === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => onFormChange("serverType", option.value)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                        isActive
                          ? "border border-sky-400/20 bg-sky-400/10 text-white"
                          : "border border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300"
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-sky-400/10 text-sky-300" : "bg-white/5"}`}>
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold">{option.label}</span>
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {form.serverType === "stdio" ? (
              <>
                <div className="space-y-2">
                  <label className={labelClass} htmlFor="mcp-command">
                    Executable Command
                  </label>
                  <input
                    id="mcp-command"
                    type="text"
                    placeholder="npx"
                    value={form.command}
                    onChange={(event) => onFormChange("command", event.target.value)}
                    required
                    className={`${fieldClass} font-mono`}
                  />
                </div>

                <div className="space-y-2">
                  <label className={labelClass} htmlFor="mcp-args">
                    Arguments
                  </label>
                  <input
                    id="mcp-args"
                    type="text"
                    placeholder="-y, @modelcontextprotocol/server-filesystem"
                    value={form.argsString}
                    onChange={(event) => onFormChange("argsString", event.target.value)}
                    className={`${fieldClass} font-mono`}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className={labelClass} htmlFor="mcp-env">
                      Environment Variables
                    </label>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">JSON</span>
                  </div>
                  <textarea
                    id="mcp-env"
                    placeholder='{"API_KEY": "..."}'
                    rows={4}
                    value={form.envString}
                    onChange={(event) => onFormChange("envString", event.target.value)}
                    className={`${fieldClass} resize-none font-mono leading-relaxed`}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2 md:col-span-2">
                <label className={labelClass} htmlFor="mcp-sse-url">
                  Remote SSE Service URL
                </label>
                <input
                  id="mcp-sse-url"
                  type="url"
                  placeholder="http://localhost:3001/sse"
                  value={form.sseUrl}
                  onChange={(event) => onFormChange("sseUrl", event.target.value)}
                  required
                  className={`${fieldClass} font-mono`}
                />
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/5 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/5 bg-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-300 transition hover:border-white/10 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              <span>{editingServerName ? "Update Server" : "Register Server"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default McpServerModal;
