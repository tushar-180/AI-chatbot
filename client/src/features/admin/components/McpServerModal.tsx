import { useState, useRef, useEffect, type FormEvent } from "react";
import { Globe, Loader2, Terminal, X, Trash2, Plus, Code, List } from "lucide-react";
import { toast } from "sonner";
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
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/95 px-3.5 py-3 text-xs text-white outline-none transition-all placeholder:text-zinc-600 focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/10 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "block text-[10px] font-bold uppercase tracking-widest text-zinc-400";

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

const parseEnvString = (envStr: string): Array<{ key: string; value: string }> => {
  if (!envStr.trim()) return [];
  try {
    const parsed = JSON.parse(envStr);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([key, val]) => ({
        key,
        value: typeof val === "string" ? val : JSON.stringify(val)
      }));
    }
  } catch (e) {
    console.error("Failed to parse envString:", e);
  }
  return [];
};

const McpServerModal = ({
  editingServerName,
  form,
  isSaving,
  onClose,
  onFormChange,
  onSubmit
}: McpServerModalProps) => {
  const [isRawMode, setIsRawMode] = useState(() => {
    if (!form.envString.trim()) return false;
    try {
      const parsed = JSON.parse(form.envString);
      return !parsed || typeof parsed !== "object" || Array.isArray(parsed);
    } catch {
      return true;
    }
  });

  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>(() => {
    return parseEnvString(form.envString);
  });

  const lastPushedEnvString = useRef(form.envString);

  useEffect(() => {
    if (form.envString !== lastPushedEnvString.current) {
      setEnvPairs(parseEnvString(form.envString));
      lastPushedEnvString.current = form.envString;
    }
  }, [form.envString]);

  const updateEnvString = (newPairs: Array<{ key: string; value: string }>) => {
    const envObj: Record<string, string> = {};
    newPairs.forEach((pair) => {
      const trimmedKey = pair.key.trim();
      if (trimmedKey) {
        envObj[trimmedKey] = pair.value;
      }
    });
    onFormChange("envString", Object.keys(envObj).length > 0 ? JSON.stringify(envObj, null, 2) : "");
  };

  const handleKeyChange = (index: number, newKey: string) => {
    const updated = [...envPairs];
    updated[index].key = newKey;
    setEnvPairs(updated);
    updateEnvString(updated);
  };

  const handleValueChange = (index: number, newValue: string) => {
    const updated = [...envPairs];
    updated[index].value = newValue;
    setEnvPairs(updated);
    updateEnvString(updated);
  };

  const handleDeleteRow = (index: number) => {
    const updated = envPairs.filter((_, i) => i !== index);
    setEnvPairs(updated);
    updateEnvString(updated);
  };

  const handleAddRow = () => {
    setEnvPairs((prev) => [...prev, { key: "", value: "" }]);
  };

  const handleToggleMode = () => {
    if (isRawMode) {
      if (!form.envString.trim()) {
        setEnvPairs([]);
        setIsRawMode(false);
        return;
      }
      try {
        const parsed = JSON.parse(form.envString);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const pairs = Object.entries(parsed).map(([key, val]) => ({
            key,
            value: typeof val === "string" ? val : JSON.stringify(val)
          }));
          setEnvPairs(pairs);
          setIsRawMode(false);
        } else {
          toast.error("JSON is not a flat object. Form UI only supports simple key-value pairs.");
        }
      } catch {
        toast.error("Invalid JSON. Please fix it before switching to Key-Value Form.");
      }
    } else {
      setIsRawMode(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <button
        type="button"
        aria-label="Close MCP server modal"
        className="absolute inset-0 cursor-default bg-zinc-950/80 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-800 bg-[#09090b] shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/40 px-5 py-4">
          <div>
            <h3 className="text-base font-bold tracking-tight text-white">
              {editingServerName ? "Edit MCP Server" : "Register MCP Server"}
            </h3>
            <p className="mt-1 text-xs font-medium text-zinc-500">
              {editingServerName ? "Update transport settings and environment values." : "Add a local command or SSE endpoint to the registry."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800/40 bg-white/5 text-zinc-400 transition hover:border-zinc-700/60 hover:bg-white/10 hover:text-white"
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
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-800/40 bg-zinc-900/50 p-1.5 sm:grid-cols-2">
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
                          : "border border-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-sky-400/10 text-sky-300" : "bg-white/5"}`}>
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold">{option.label}</span>
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
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

                <div className="space-y-3 md:col-span-2">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-800/40 pb-2">
                    <div>
                      <span className={labelClass}>Environment Variables</span>
                      <p className="mt-0.5 text-[10px] text-zinc-500 font-medium normal-case">
                        Configure environment variables for the server process.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleMode}
                      className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:bg-white/10 hover:text-white transition-all"
                    >
                      {isRawMode ? (
                        <>
                          <List size={11} />
                          <span>Form UI</span>
                        </>
                      ) : (
                        <>
                          <Code size={11} />
                          <span>JSON UI</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isRawMode ? (
                    <div className="space-y-2">
                      <textarea
                        id="mcp-env"
                        placeholder='{"API_KEY": "value"}'
                        rows={5}
                        value={form.envString}
                        onChange={(event) => {
                          onFormChange("envString", event.target.value);
                        }}
                        className={`${fieldClass} resize-none font-mono leading-relaxed text-sky-300 placeholder:text-zinc-700`}
                      />
                      <p className="text-[10px] text-zinc-600 font-medium">
                        Must be a valid JSON object. E.g. {"{"}"API_KEY": "your_key"{"}"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {envPairs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800/40 bg-zinc-900/10 p-6 text-center">
                          <p className="text-[11px] font-semibold text-zinc-500">No environment variables defined yet.</p>
                          <button
                            type="button"
                            onClick={handleAddRow}
                            className="mt-3 flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition hover:border-zinc-700/60 hover:bg-white/10 hover:text-white"
                          >
                            <Plus size={12} />
                            <span>Add Variable</span>
                          </button>
                        </div>
                      ) : (
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                          <div className="grid grid-cols-[1fr_1fr_auto] gap-2.5 px-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Name / Key</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Value</span>
                            <span className="w-9"></span>
                          </div>
                          
                          {envPairs.map((pair, index) => (
                            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2.5 items-center group animate-in fade-in slide-in-from-left-1 duration-150">
                              <input
                                type="text"
                                placeholder="e.g. API_KEY"
                                value={pair.key}
                                onChange={(e) => handleKeyChange(index, e.target.value)}
                                className="w-full rounded-lg border border-zinc-800/40 bg-zinc-900/60 px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-700 outline-none transition-all focus:border-sky-400/40 focus:ring-1 focus:ring-sky-400/10 focus:bg-zinc-900/90"
                              />
                              <input
                                type="text"
                                placeholder="value"
                                value={pair.value}
                                onChange={(e) => handleValueChange(index, e.target.value)}
                                className="w-full rounded-lg border border-zinc-800/40 bg-zinc-900/60 px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-700 outline-none transition-all focus:border-sky-400/40 focus:ring-1 focus:ring-sky-400/10 focus:bg-zinc-900/90"
                              />
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(index)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/10 bg-red-500/5 text-red-400 hover:border-red-500/20 hover:bg-red-500/10 transition-all opacity-80 group-hover:opacity-100"
                                title="Delete row"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {envPairs.length > 0 && (
                        <div className="flex justify-start">
                          <button
                            type="button"
                            onClick={handleAddRow}
                            className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50 px-3 py-2 text-xs font-semibold text-sky-400 hover:text-sky-300 transition-all duration-200"
                          >
                            <Plus size={13} />
                            Add Variable
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-zinc-800/40 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-800 bg-white/5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-zinc-300 transition hover:border-zinc-700/60 hover:bg-white/10 hover:text-white"
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
