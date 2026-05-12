import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  User,
  Briefcase,
  Zap,
  Shield,
  Save,
  Loader2,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";

interface PersonalizationData {
  nickname: string;
  occupation: string;
  tone: string;
  customInstructions: string;
}

interface PersonalizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TONE_OPTIONS = [
  "Default",
  "Professional",
  "Casual",
  "Enthusiastic",
  "Concise",
  "Detailed",
  "Friendly",
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL_DEV || "http://localhost:5000";

const PersonalizationModal: React.FC<PersonalizationModalProps> = ({ isOpen, onClose }) => {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState<PersonalizationData>({
    nickname: "",
    occupation: "",
    tone: "Default",
    customInstructions: "",
  });

  const fetchPersonalization = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/user/profile/${user.id}`
      );
      if (!response.ok) throw new Error("Failed to fetch profile");
      const userData = await response.json();
      if (userData.personalization) {
        setData({
          nickname: userData.personalization.nickname || "",
          occupation: userData.personalization.occupation || "",
          tone: userData.personalization.tone || "Default",
          customInstructions: userData.personalization.customInstructions || "",
        });
      }
    } catch (error) {
      console.error("Fetch Error:", error);
      toast.error("Failed to load your preferences");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/user/personalization/${user.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) throw new Error("Update failed");

      toast.success("Identity updated successfully");
      onClose();
    } catch (error) {
      console.error("Save Error:", error);
      toast.error("Failed to update preferences");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPersonalization();
      // Mark background as inert to prevent focus issues
      const root = document.querySelector(".min-h-screen");
      if (root) root.setAttribute("inert", "");
    } else {
      const root = document.querySelector(".min-h-screen");
      if (root) root.removeAttribute("inert");
    }
    return () => {
      const root = document.querySelector(".min-h-screen");
      if (root) root.removeAttribute("inert");
    };
  }, [isOpen, user]);

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-8 py-8 border-b border-zinc-900 flex items-center justify-between bg-gradient-to-br from-zinc-900/50 to-transparent">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Personalization
                  </h2>
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                  Define how Velora interacts with you
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-zinc-900 rounded-2xl transition-all text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">
                    Retrieving profile...
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Basic Info Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
                        <User className="w-3 h-3" />
                        Nickname
                      </label>
                      <input
                        type="text"
                        value={data.nickname}
                        onChange={(e) => setData({ ...data, nickname: e.target.value })}
                        placeholder="What should Velora call you?"
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
                        <Briefcase className="w-3 h-3" />
                        Occupation
                      </label>
                      <input
                        type="text"
                        value={data.occupation}
                        onChange={(e) => setData({ ...data, occupation: e.target.value })}
                        placeholder="e.g. Software Engineer"
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                      />
                    </div>
                  </div>

                  {/* Tone Select */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
                      <Zap className="w-3 h-3" />
                      Response Tone
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {TONE_OPTIONS.map((tone) => (
                        <button
                          key={tone}
                          onClick={() => setData({ ...data, tone })}
                          className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                            data.tone === tone
                              ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                              : "bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                          }`}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Instructions */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
                      <MessageSquare className="w-3 h-3" />
                      Custom Instructions
                    </label>
                    <textarea
                      value={data.customInstructions}
                      onChange={(e) => setData({ ...data, customInstructions: e.target.value })}
                      placeholder="e.g. Always explain code step-by-step, or 'Keep answers short and direct'..."
                      rows={4}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-8 py-6 bg-zinc-950 border-t border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-3 h-3 text-zinc-700" />
                <span className="text-[9px] text-zinc-700 uppercase tracking-widest font-bold">
                  Preferences stored locally
                </span>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || isLoading}
                className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-white/5"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isSaving ? "Saving..." : "Save Identity"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default PersonalizationModal;
