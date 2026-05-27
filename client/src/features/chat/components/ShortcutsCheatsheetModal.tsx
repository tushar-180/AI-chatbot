import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Keyboard,
  ShieldAlert,
  Sparkles,
  Check,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

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

const ShortcutsCheatsheetModal = ({
  isOpen,
  onClose,
}: ShortcutsCheatsheetModalProps) => {
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
      localStorage.setItem(
        "velora-shortcuts-settings",
        JSON.stringify(updated),
      );
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

  const isMac =
    typeof window !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;
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
      className="fixed inset-0 z-100 flex items-center justify-center p-0 lg:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onMouseDown={(e) => setMouseDownOnBackdrop(e.target === e.currentTarget)}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop && e.target === e.currentTarget) onClose();
        setMouseDownOnBackdrop(false);
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full lg:h-auto lg:max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-none lg:rounded-[2rem] border-0 lg:border lg:border-zinc-200 lg:dark:border-zinc-800/60 bg-white dark:bg-zinc-950 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200 text-zinc-900 dark:text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850 px-4 lg:px-8 py-4 lg:py-6 gap-4">
          <div className="flex items-center gap-3 lg:gap-4 min-w-0">
            <div className="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shrink-0">
              <Keyboard size={20} className="lg:w-6 lg:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base lg:text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2 truncate">
                Shortcuts
                <span className="text-[9px] font-bold bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 border border-zinc-200 dark:border-zinc-800">
                  Keys
                </span>
              </h2>
              <p className="text-[9px] lg:text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-450 dark:text-zinc-500 truncate">
                Enhance your productivity with hotkeys
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="group flex h-9 w-9 lg:h-10 lg:w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 transition-all hover:bg-zinc-200 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white shrink-0 cursor-pointer"
          >
            <X size={18} className="lg:w-5 lg:h-5" />
          </button>
        </div>

        {/* Master Control Panel */}
        <div className="bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-100 dark:border-zinc-900 px-4 lg:px-8 py-3.5 lg:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles
              size={16}
              className={`shrink-0 ${settings.globalEnabled ? "text-zinc-900 dark:text-white" : "text-zinc-400 dark:text-zinc-650"}`}
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider truncate">
                Enable Keyboard Shortcuts
              </p>
              <p className="text-[9px] lg:text-[10px] text-zinc-500 dark:text-zinc-500 truncate">
                Master switch to turn on/off custom hotkeys globally
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              updateSetting("globalEnabled", !settings.globalEnabled)
            }
            className="focus:outline-none transition-transform active:scale-[0.9] shrink-0 cursor-pointer"
          >
            {settings.globalEnabled ? (
              <ToggleRight
                size={38}
                className="text-zinc-900 dark:text-white fill-zinc-900/10 dark:fill-white/10 transition-colors lg:w-[44px] lg:h-[44px]"
              />
            ) : (
              <ToggleLeft
                size={38}
                className="text-zinc-400 dark:text-zinc-600 transition-colors lg:w-[44px] lg:h-[44px]"
              />
            )}
          </button>
        </div>

        {/* Shortcuts List Panel */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar bg-white dark:bg-zinc-950">
          <div className="space-y-6">
            <div>
              <h3 className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 dark:text-zinc-650 mb-3 ml-1">
                Customizable Hotkeys
              </h3>
              <div className="space-y-2.5">
                {shortcutItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 rounded-2xl border transition-all gap-3 ${
                      !settings.globalEnabled
                        ? "bg-zinc-50/20 dark:bg-zinc-950/20 border-zinc-100 dark:border-zinc-800/40 opacity-50"
                        : settings[item.id]
                          ? "bg-zinc-50 dark:bg-white/5 border-zinc-200 dark:border-zinc-800/60"
                          : "bg-zinc-50/30 dark:bg-zinc-950/40 border-zinc-150 dark:border-zinc-800/40 opacity-70"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[8px] lg:text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                          {item.category}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                        {item.name}
                      </h4>
                      <p className="text-xs text-zinc-500 line-clamp-1">
                        {item.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 lg:gap-4 shrink-0 w-full sm:w-auto">
                      {/* Key Indicators */}
                      <div className="flex items-center gap-1">
                        {item.keys.map((k, i) => (
                          <kbd
                            key={i}
                            className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-zinc-800/60 text-zinc-600 dark:text-zinc-300 min-w-[20px] text-center shadow-inner"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>

                      {/* Enable/Disable Toggle */}
                      <button
                        disabled={!settings.globalEnabled}
                        onClick={() =>
                          updateSetting(item.id, !settings[item.id])
                        }
                        className="h-8 w-8 rounded-lg flex items-center justify-center transition-all bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-zinc-800/40 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-40 cursor-pointer"
                      >
                        <div
                          className={`h-4.5 w-4.5 rounded flex items-center justify-center border transition-all ${
                            settings[item.id] && settings.globalEnabled
                              ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-black"
                              : "border-zinc-300 dark:border-zinc-700 bg-transparent text-transparent"
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
              <h3 className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 dark:text-zinc-650 mb-3 ml-1">
                System Keybinds (Always On)
              </h3>
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-950/60 gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[8px] lg:text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                      Core
                    </span>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      Open Keyboard Shortcuts Modal
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Toggle this modal instantly from anywhere
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                    <kbd className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-zinc-900 dark:bg-white border border-zinc-900 dark:border-white text-white dark:text-black">
                      {modKey}
                    </kbd>
                    <kbd className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-zinc-900 dark:bg-white border border-zinc-900 dark:border-white text-white dark:text-black">
                      /
                    </kbd>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-950/60 gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[8px] lg:text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                      Search Modal
                    </span>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      Open Search Modal
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Launch conversation search from anywhere
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                    <kbd className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-zinc-850 text-zinc-650 dark:text-zinc-300">
                      {modKey}
                    </kbd>
                    <kbd className="px-2 py-1 text-[10px] lg:text-xs font-bold font-sans rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-zinc-850 text-zinc-650 dark:text-zinc-300">
                      K
                    </kbd>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 lg:p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/40 bg-zinc-50 dark:bg-zinc-950/60 gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[8px] lg:text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                      Search Modal
                    </span>
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                      List Arrow Navigation & Selection
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Browse search hits with keys, Enter to open
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-start sm:self-center">
                    <kbd className="px-1.5 py-0.5 text-xs font-sans rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-zinc-850 text-zinc-500 dark:text-zinc-400">
                      ↑
                    </kbd>
                    <span className="text-[9px] text-zinc-500 dark:text-zinc-600">/</span>
                    <kbd className="px-1.5 py-0.5 text-xs font-sans rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-zinc-850 text-zinc-500 dark:text-zinc-400">
                      ↓
                    </kbd>
                    <span className="text-[9px] text-zinc-500 dark:text-zinc-600">+</span>
                    <kbd className="px-1.5 py-0.5 text-xs font-sans rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-zinc-850 text-zinc-500 dark:text-zinc-400">
                      Enter
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 lg:px-8 py-3.5 lg:py-4 border-t border-zinc-100 dark:border-zinc-850 bg-zinc-50 dark:bg-zinc-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[9px] lg:text-[10px] text-zinc-500 uppercase tracking-widest">
            <ShieldAlert size={14} className="text-amber-500/60 shrink-0" />
            <span>Customize anytime</span>
          </div>
          <span className="text-[9px] lg:text-[10px] font-bold text-zinc-900 dark:text-white/60 uppercase tracking-[0.2em]">
            Velora Shortcuts
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default memo(ShortcutsCheatsheetModal);
