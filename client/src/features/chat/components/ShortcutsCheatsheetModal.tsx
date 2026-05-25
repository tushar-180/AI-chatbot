import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Keyboard, ShieldAlert, Sparkles, Check, ToggleLeft, ToggleRight } from "lucide-react";

interface ShortcutsCheatsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutSettings {
  globalEnabled: boolean;
  toggleSidebar: boolean;
  newChat: boolean;
  openSettings: boolean;
  openGallery: boolean;
  toggleTempChat: boolean;
  focusInput: boolean;
}

const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
  globalEnabled: true,
  toggleSidebar: true,
  newChat: true,
  openSettings: true,
  openGallery: true,
  toggleTempChat: true,
  focusInput: true,
};

const ShortcutsCheatsheetModal = ({ isOpen, onClose }: ShortcutsCheatsheetModalProps) => {
  const [settings, setSettings] = useState<ShortcutSettings>(() => {
    try {
      const stored = localStorage.getItem("velora-shortcuts-settings");
      return stored ? JSON.parse(stored) : DEFAULT_SHORTCUT_SETTINGS;
    } catch (e) {
      console.error("Failed to load shortcut settings", e);
      return DEFAULT_SHORTCUT_SETTINGS;
    }
  });
  const [mouseDownOnBackdrop, setMouseDownOnBackdrop] = useState(false);

  const updateSetting = (key: keyof ShortcutSettings, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      localStorage.setItem("velora-shortcuts-settings", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save shortcut settings", e);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      const root = document.querySelector(".min-h-screen");
      if (root) root.setAttribute("inert", "");
    } else {
      const root = document.querySelector(".min-h-screen");
      if (root) root.removeAttribute("inert");
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const root = document.querySelector(".min-h-screen");
      if (root) root.removeAttribute("inert");
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = typeof window !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modKey = isMac ? "⌘" : "Ctrl";
  const shiftKey = isMac ? "⇧" : "Shift";

  const shortcutItems = [
    {
      id: "toggleSidebar" as keyof ShortcutSettings,
      name: "Toggle Sidebar",
      keys: [modKey, "\\"],
      description: "Show or hide the conversation sidebar",
      category: "Navigation",
    },
    {
      id: "newChat" as keyof ShortcutSettings,
      name: "New Conversation",
      keys: [modKey, shiftKey, "O"],
      description: "Start a fresh AI chat thread instantly",
      category: "Chat Actions",
    },
    {
      id: "openSettings" as keyof ShortcutSettings,
      name: "Open Settings",
      keys: [modKey, ","],
      description: "Manage your profile, theme, and API keys",
      category: "Navigation",
    },
    {
      id: "openGallery" as keyof ShortcutSettings,
      name: "Open Gallery",
      keys: [modKey, shiftKey, "G"],
      description: "Browse uploaded media and AI-generated files",
      category: "Navigation",
    },
    {
      id: "toggleTempChat" as keyof ShortcutSettings,
      name: "Temporary Chat Mode",
      keys: [modKey, shiftKey, "Y"],
      description: "Toggle ghost/incognito mode for unsaved sessions",
      category: "Chat Actions",
    },
    {
      id: "focusInput" as keyof ShortcutSettings,
      name: "Focus Input / Escape Modal",
      keys: ["Esc"],
      description: "Focus prompt field, or dismiss active overlay",
      category: "Navigation",
    },
  ];

  const modalContent = (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-0 lg:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onMouseDown={(e) => setMouseDownOnBackdrop(e.target === e.currentTarget)}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop && e.target === e.currentTarget) onClose();
        setMouseDownOnBackdrop(false);
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full lg:h-auto lg:max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-none lg:rounded-[2rem] border-0 lg:border lg:border-white/10 bg-slate-950 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-4 lg:px-8 py-4 lg:py-6 gap-4">
          <div className="flex items-center gap-3 lg:gap-4 min-w-0">
            <div className="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 shrink-0">
              <Keyboard size={20} className="lg:w-6 lg:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base lg:text-xl font-bold tracking-tight text-white flex items-center gap-2 truncate">
                Shortcuts
                <span className="text-[9px] font-bold bg-emerald-400/10 text-emerald-400 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                  Keys
                </span>
              </h2>
              <p className="text-[9px] lg:text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 truncate">
                Enhance your productivity with hotkeys
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="group flex h-9 w-9 lg:h-10 lg:w-10 items-center justify-center rounded-xl bg-white/5 text-slate-400 transition-all hover:bg-white/10 hover:text-white shrink-0"
          >
            <X size={18} className="lg:w-5 lg:h-5" />
          </button>
        </div>

        {/* Master Control Panel */}
        <div className="bg-slate-950/40 border-b border-white/5 px-4 lg:px-8 py-3.5 lg:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles size={16} className={`shrink-0 ${settings.globalEnabled ? "text-emerald-400" : "text-slate-600"}`} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white uppercase tracking-wider truncate">Enable Keyboard Shortcuts</p>
              <p className="text-[9px] lg:text-[10px] text-slate-500 truncate">Master switch to turn on/off custom hotkeys globally</p>
            </div>
          </div>
          <button
            onClick={() => updateSetting("globalEnabled", !settings.globalEnabled)}
            className="focus:outline-none transition-transform active:scale-[0.9] shrink-0"
          >
            {settings.globalEnabled ? (
              <ToggleRight size={38} className="text-emerald-400 fill-emerald-400/10 transition-colors lg:w-[44px] lg:h-[44px]" />
            ) : (
              <ToggleLeft size={38} className="text-slate-600 transition-colors lg:w-[44px] lg:h-[44px]" />
            )}
          </button>
        </div>

        {/* Shortcuts List Panel */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          <div className="space-y-6">
            <div>
              <h3 className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-600 mb-3 ml-1">Customizable Hotkeys</h3>
              <div className="space-y-2.5">
                {shortcutItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 rounded-2xl border transition-all gap-3 ${
                      !settings.globalEnabled
                        ? "bg-slate-950/20 border-white/5 opacity-50"
                        : settings[item.id]
                        ? "bg-white/3 border-white/10"
                        : "bg-slate-950/40 border-white/5 opacity-70"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[8px] lg:text-[9px] font-extrabold uppercase tracking-widest text-slate-600">
                          {item.category}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white truncate">{item.name}</h4>
                      <p className="text-xs text-slate-500 line-clamp-1">{item.description}</p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 lg:gap-4 shrink-0 w-full sm:w-auto">
                      {/* Key Indicators */}
                      <div className="flex items-center gap-1">
                        {item.keys.map((k, i) => (
                          <kbd
                            key={i}
                            className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-white/5 border border-white/10 text-slate-300 min-w-[20px] text-center shadow-inner"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>

                      {/* Enable/Disable Toggle */}
                      <button
                        disabled={!settings.globalEnabled}
                        onClick={() => updateSetting(item.id, !settings[item.id])}
                        className="h-8 w-8 rounded-lg flex items-center justify-center transition-all bg-white/5 border border-white/5 text-slate-500 hover:text-white disabled:opacity-40"
                      >
                        <div
                          className={`h-4.5 w-4.5 rounded flex items-center justify-center border transition-all ${
                            settings[item.id] && settings.globalEnabled
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "border-slate-700 bg-transparent text-transparent"
                          }`}
                        >
                          <Check size={10} strokeWidth={4} />
                        </div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Permanent Shortcuts Section */}
            <div>
              <h3 className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-600 mb-3 ml-1">System Keybinds (Always On)</h3>
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 rounded-2xl border border-white/5 bg-slate-950/60 gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[8px] lg:text-[9px] font-extrabold uppercase tracking-widest text-slate-600">Core</span>
                    <h4 className="text-sm font-semibold text-white truncate">Open Keyboard Shortcuts Modal</h4>
                    <p className="text-xs text-slate-500">Toggle this modal instantly from anywhere</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                    <kbd className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{modKey}</kbd>
                    <kbd className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">/</kbd>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 rounded-2xl border border-white/5 bg-slate-950/60 gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[8px] lg:text-[9px] font-extrabold uppercase tracking-widest text-slate-600">Search Modal</span>
                    <h4 className="text-sm font-semibold text-white truncate">Open Search Modal</h4>
                    <p className="text-xs text-slate-500">Launch conversation search from anywhere</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                    <kbd className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-white/5 border border-white/10 text-slate-300">{modKey}</kbd>
                    <kbd className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-white/5 border border-white/10 text-slate-300">K</kbd>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 rounded-2xl border border-white/5 bg-slate-950/60 gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[8px] lg:text-[9px] font-extrabold uppercase tracking-widest text-slate-600">Search Modal</span>
                    <h4 className="text-sm font-semibold text-white truncate">List Arrow Navigation & Selection</h4>
                    <p className="text-xs text-slate-500">Browse search hits with keys, Enter to open</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                    <kbd className="px-1.5 py-0.5 text-xs font-sans rounded bg-white/5 border border-white/10 text-slate-400">↑</kbd>
                    <span className="text-[9px] text-slate-600">/</span>
                    <kbd className="px-1.5 py-0.5 text-xs font-sans rounded bg-white/5 border border-white/10 text-slate-400">↓</kbd>
                    <span className="text-[9px] text-slate-600">+</span>
                    <kbd className="px-1.5 py-0.5 text-xs font-sans rounded bg-white/5 border border-white/10 text-slate-400">Enter</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 lg:px-8 py-3.5 lg:py-4 border-t border-white/5 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[9px] lg:text-[10px] text-slate-500 uppercase tracking-widest">
            <ShieldAlert size={14} className="text-amber-500/60 shrink-0" />
            <span>Customize anytime</span>
          </div>
          <span className="text-[9px] lg:text-[10px] font-bold text-emerald-500/60 uppercase tracking-[0.2em]">Velora Shortcuts</span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default memo(ShortcutsCheatsheetModal);
