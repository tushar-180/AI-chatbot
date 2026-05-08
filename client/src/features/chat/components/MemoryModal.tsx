import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Brain, Trash2, Shield, User, Settings, Briefcase, Zap, Loader2, ChevronDown } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";

interface Memory {
  _id: string;
  content: string;
  category: string;
  createdAt: string;
}

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const categoryIcons: Record<string, any> = {
  personal: User,
  preference: Settings,
  technical: Zap,
  work: Briefcase,
  general: Brain,
};

const LIMIT = 20;

const MemoryModal: React.FC<MemoryModalProps> = ({ isOpen, onClose }) => {
  const { user } = useUser();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);

  const MAX_CAPACITY = 100;
  const memoryCount = memories.length;
  const percentage = Math.min((memoryCount / MAX_CAPACITY) * 100, 100);

  const getProgressColor = () => {
    if (percentage < 50) return "bg-emerald-500";
    if (percentage < 80) return "bg-amber-500";
    return "bg-rose-500";
  };

  const fetchMemories = useCallback(async (isInitial = true) => {
    if (!user) return;
    
    if (isInitial) {
      setIsLoading(true);
      setSkip(0);
    } else {
      setIsMoreLoading(true);
    }

    try {
      const currentSkip = isInitial ? 0 : skip + LIMIT;
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/memory?limit=${LIMIT}&skip=${currentSkip}`,
        {
          headers: { "x-user-id": user.id },
        }
      );

      if (!response.ok) throw new Error("Failed to fetch memories");

      const data = await response.json();
      
      if (isInitial) {
        setMemories(data);
      } else {
        setMemories(prev => [...prev, ...data]);
      }

      setHasMore(data.length === LIMIT);
      setSkip(currentSkip);
    } catch (error) {
      console.error("Memory Fetch Error:", error);
      toast.error("Failed to sync neural bank");
    } finally {
      setIsLoading(false);
      setIsMoreLoading(false);
    }
  }, [user, skip]);

  const deleteMemory = async (id: string) => {
    if (!user) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/memory/${id}`, {
        method: "DELETE",
        headers: { "x-user-id": user.id },
      });

      if (response.status === 404) {
        toast.error("Memory fragment already purged");
        setMemories((prev) => prev.filter((m) => m._id !== id));
        return;
      }

      if (!response.ok) throw new Error("Deletion failed");

      setMemories((prev) => prev.filter((m) => m._id !== id));
      toast.success("Memory purged successfully");
    } catch (error) {
      console.error("Delete Error:", error);
      toast.error("Failed to purge memory fragment");
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Blur any active element (like the chat textarea) to prevent aria-hidden conflicts
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      
      // Mark background as inert to prevent focus issues
      const root = document.querySelector(".min-h-screen");
      if (root) root.setAttribute("inert", "");

      fetchMemories(true);
    } else {
      // Remove inert when closing
      const root = document.querySelector(".min-h-screen");
      if (root) root.removeAttribute("inert");
    }
    
    return () => {
      const root = document.querySelector(".min-h-screen");
      if (root) root.removeAttribute("inert");
    };
  }, [isOpen, user]); // Only run when modal opens or user changes

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="px-6 py-6 border-b border-zinc-900 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-white tracking-tight">Neural Bank</h2>
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mt-1">Core Identity Fragments</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-zinc-900 rounded-full transition-colors text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Capacity Bar */}
            <div className="px-6 py-4 bg-zinc-900/20 border-b border-zinc-900">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Memory Capacity</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${percentage > 80 ? 'text-rose-400' : 'text-zinc-500'}`}>
                  {memoryCount} / {MAX_CAPACITY}
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  className={`h-full transition-colors duration-500 ${getProgressColor()}`}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">Synchronizing...</p>
                </div>
              ) : memories.length === 0 ? (
                <div className="text-center py-20">
                  <Brain className="w-8 h-8 text-zinc-800 mx-auto mb-4 opacity-20" />
                  <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.3em]">Neural storage empty</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {memories.map((memory) => {
                      const Icon = categoryIcons[memory.category] || Brain;
                      return (
                        <motion.div layout key={memory._id} className="group relative flex items-start gap-4 pb-4 border-b border-zinc-900/50 last:border-0">
                          <div className="mt-1 p-1.5 text-zinc-500 group-hover:text-zinc-300 transition-colors">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-zinc-300 text-[13px] leading-relaxed font-light">{memory.content}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-zinc-600">{memory.category}</span>
                              <span className="w-1 h-1 rounded-full bg-zinc-800" />
                              <span className="text-[9px] text-zinc-700 font-medium">{new Date(memory.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <button onClick={() => deleteMemory(memory._id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-rose-500 transition-all text-zinc-700">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>

                  {hasMore && (
                    <button
                      onClick={() => fetchMemories(false)}
                      disabled={isMoreLoading}
                      className="w-full py-4 mt-4 text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2 border border-dashed border-zinc-900 rounded-xl hover:border-zinc-700 bg-zinc-900/20"
                    >
                      {isMoreLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isMoreLoading ? "Extracting..." : "Load More Fragments"}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-3 h-3 text-zinc-700" />
                <span className="text-[9px] text-zinc-700 uppercase tracking-widest font-bold">Encrypted Node</span>
              </div>
              <span className="text-[9px] text-zinc-800 font-mono tracking-tighter">BANK_V2.5 // SECURE</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default MemoryModal;
