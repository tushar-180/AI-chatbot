import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Loader2, Share2 } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, chatId }) => {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    } else {
      setCopied(false);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleShare = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const response = await api.post(
        `/shared-chat/${chatId}/share`,
        {},
        {
          headers: { "x-user-id": user.id },
        }
      );
      console.log("Share Response:", response.data);
      const { url } = response.data;
      
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      
      // Auto close after success? The prompt says "Close modal after success"
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error("Share Error:", error);
      toast.error("Failed to generate share link");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-6 py-6 border-b border-zinc-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Share2 className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-medium text-white tracking-tight">
              Share Chat
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-900 rounded-full transition-colors text-zinc-500 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Share this chat using a public link. Anyone with the link can view this conversation.
          </p>
          
          <div className="space-y-2">
            <button
              onClick={handleShare}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : copied ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {isLoading ? "Generating Link..." : copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={onClose}
              className="w-full px-4 py-3 bg-zinc-900 text-white font-medium rounded-xl hover:bg-zinc-800 transition-all border border-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-zinc-900/30 border-t border-zinc-900 flex items-center justify-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
                Snapshots do not auto-sync
            </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ShareModal;
