import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Image as ImageIcon,
  MessageSquare,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useGallery } from "../hooks/useGallery";
import { useChatList } from "../hooks/useChatList";

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GalleryModal = ({ isOpen, onClose }: GalleryModalProps) => {
  const { items, loading, error } = useGallery();
  const { selectChat } = useChatList();
  const [mouseDownOnBackdrop, setMouseDownOnBackdrop] = useState(false);

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

  const handleGoToChat = (chatId: string) => {
    selectChat(chatId);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-100 flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-xl not-selectable"
      onMouseDown={(e) => setMouseDownOnBackdrop(e.target === e.currentTarget)}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop && e.target === e.currentTarget) onClose();
        setMouseDownOnBackdrop(false);
      }}
    >
      {/* Modal Content */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full max-h-[800px] w-full max-w-5xl flex-col overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#030712] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-white">
              <ImageIcon size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Multimedia Gallery
              </h2>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                {items.length} {items.length === 1 ? "Asset" : "Assets"}{" "}
                Uploaded
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="group flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-slate-400 transition-all hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Grid Body */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-white/20" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600">
                Syncing Assets...
              </p>
            </div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center text-rose-500">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 opacity-40">
              <ImageIcon size={48} strokeWidth={1} />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em]">
                No assets found in your history
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item, i) => (
                <div
                  key={`${item.messageId}-${i}`}
                  className="group relative aspect-square overflow-hidden rounded-3xl border border-white/5 bg-white/2 transition-all hover:border-white/20"
                >
                  <img
                    src={item.url}
                    alt={item.name || "Gallery image"}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => {
                      (e.target as HTMLImageElement).parentElement?.classList.add('hidden');
                    }}
                  />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 flex flex-col justify-end bg-black/60 p-4 opacity-0 transition-opacity group-hover:opacity-100 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => window.open(item.url, "_blank")}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
                        title="View Full Size"
                      >
                        <ExternalLink size={16} />
                      </button>

                      <button
                        onClick={() => handleGoToChat(item.chatId)}
                        className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl bg-white text-black text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                      >
                        <MessageSquare size={12} />
                        <span>Chat</span>
                      </button>
                    </div>
                  </div>

                  {/* Date Badge */}
                  <div className="absolute top-3 left-3 rounded-lg bg-black/40 px-2 py-1 backdrop-blur-md">
                    <p className="text-[8px] font-bold text-white/60">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default memo(GalleryModal);
