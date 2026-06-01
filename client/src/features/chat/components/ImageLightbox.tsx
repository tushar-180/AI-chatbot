import { useEffect, useState } from "react";
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  FileText,
  Table,
  MonitorPlay,
  File as FileIcon,
} from "lucide-react";
import { useChatStore } from "../store/useChatStore";

export default function ImageLightbox() {
  const activeAttachment = useChatStore(
    (state) => state.activeZoomedAttachment,
  );
  const setActiveZoomedAttachment = useChatStore(
    (state) => state.setActiveZoomedAttachment,
  );

  // Interactive zoom and pan states
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);

  // Reset states when attachment changes
  useEffect(() => {
    setScale(1);
    setMediaLoading(true);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [activeAttachment?.url, activeAttachment?.name]);

  // Handle ESC keypress to close
  useEffect(() => {
    if (!activeAttachment) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveZoomedAttachment(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    // Lock background scroll when open
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [
    activeAttachment?.url,
    activeAttachment?.name,
    setActiveZoomedAttachment,
  ]);

  // Handle text loading if document is text
  useEffect(() => {
    if (!activeAttachment) {
      setTextContent(null);
      return;
    }
    const { url = "", mimeType = "" } = activeAttachment;
    const urlLower = (url || "").toLowerCase();
    const isText =
      (mimeType || "").startsWith("text/") || urlLower.includes(".txt");

    if (isText && url) {
      setLoadingText(true);
      if (url.startsWith("data:")) {
        try {
          const base64Data = url.split(",")[1];
          const decoded = atob(base64Data);
          setTextContent(decoded);
        } catch (e) {
          console.error("Failed to decode text file:", e);
          setTextContent("Error: Failed to decode text file contents.");
        } finally {
          setLoadingText(false);
        }
      } else {
        fetch(url)
          .then((r) => r.text())
          .then((text) => setTextContent(text))
          .catch((err) => {
            console.error("Failed to fetch text content:", err);
            setTextContent("Error: Failed to load file contents.");
          })
          .finally(() => setLoadingText(false));
      }
    } else {
      setTextContent(null);
    }
  }, [activeAttachment?.url, activeAttachment?.name]);

  if (!activeAttachment) return null;

  const { url = "", mimeType = "", name = "", size } = activeAttachment;
  const safeUrl = url || "";
  const urlLower = safeUrl.toLowerCase();
  const safeMimeType = mimeType || "";
  const nameLower = (name || "").toLowerCase();

  // Determine media type
  const isImage =
    safeMimeType.startsWith("image/") ||
    safeUrl.startsWith("data:image") ||
    nameLower.endsWith(".png") ||
    nameLower.endsWith(".jpg") ||
    nameLower.endsWith(".jpeg") ||
    nameLower.endsWith(".webp") ||
    nameLower.endsWith(".gif");
  const isPdf =
    safeMimeType === "application/pdf" ||
    urlLower.includes(".pdf") ||
    nameLower.endsWith(".pdf") ||
    nameLower.includes(".pdf");
  const isText =
    safeMimeType.startsWith("text/") ||
    urlLower.includes(".txt") ||
    nameLower.endsWith(".txt") ||
    nameLower.includes(".txt");

  // Office document detection
  const isWord =
    safeMimeType.includes("word") ||
    safeMimeType.includes("officedocument.wordprocessingml") ||
    urlLower.includes(".doc") ||
    urlLower.includes(".docx") ||
    nameLower.endsWith(".doc") ||
    nameLower.endsWith(".docx");
  const isExcel =
    safeMimeType.includes("excel") ||
    safeMimeType.includes("sheet") ||
    safeMimeType.includes("officedocument.spreadsheetml") ||
    urlLower.includes(".xls") ||
    urlLower.includes(".xlsx") ||
    nameLower.endsWith(".xls") ||
    nameLower.endsWith(".xlsx");
  const isPpt =
    safeMimeType.includes("powerpoint") ||
    safeMimeType.includes("presentation") ||
    safeMimeType.includes("officedocument.presentationml") ||
    urlLower.includes(".ppt") ||
    urlLower.includes(".pptx") ||
    nameLower.endsWith(".ppt") ||
    nameLower.endsWith(".pptx");

  const isOffice = isWord || isExcel || isPpt;
  const isPublicUrl = safeUrl.startsWith("http");

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(prev - 0.25, 0.5);
      if (next <= 1) setPanOffset({ x: 0, y: 0 }); // Reset pan when zooming out to normal
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  };

  // Drag and pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setIsPanning(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || scale <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setIsPanning(false);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) return;

    try {
      if (url.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = url;
        const mime = url.split(";")[0].split(":")[1];
        const ext = mime.split("/")[1] || "bin";
        link.download = name || `velora-chat-file-${Date.now()}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = blobUrl;

        // Extract filename or generate one
        const urlParts = url.split("/");
        const fileName =
          name ||
          urlParts[urlParts.length - 1].split("?")[0] ||
          `velora-chat-file-${Date.now()}`;
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error("Failed to download file:", error);
      window.open(url, "_blank");
    }
  };

  const getFileIcon = () => {
    if (isWord) return FileText;
    if (isExcel) return Table;
    if (isPpt) return MonitorPlay;
    return FileIcon;
  };
  const Icon = getFileIcon();

  // Optimized high-speed Office Online Viewer URL
  const officeViewerUrl = isWord
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <div
      onClick={() => setActiveZoomedAttachment(null)}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-xl animate-in fade-in duration-150 select-none cursor-zoom-out"
    >
      {/* Top Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 shadow-2xl backdrop-blur-md"
      >
        {isImage && (
          <>
            <button
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>

            <span
              onClick={handleResetZoom}
              className="cursor-pointer text-xs font-mono font-semibold text-slate-300 hover:text-white px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
              title="Reset Zoom"
            >
              {Math.round(scale * 100)}%
            </span>

            <button
              onClick={handleZoomIn}
              disabled={scale >= 3}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>

            <div className="h-4 w-px bg-white/10 mx-1" />
          </>
        )}

        {url && !url.startsWith("data:") && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-all"
            title="Open Original in New Tab"
          >
            <ExternalLink size={16} />
          </a>
        )}

        {url && <div className="h-4 w-px bg-white/10 mx-1" />}

        <button
          onClick={() => setActiveZoomedAttachment(null)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      {/* Viewer Container */}
      <div className="relative flex items-center justify-center w-full h-full p-4 md:p-8 pt-20">
        {isImage ? (
          <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
            {mediaLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            )}
            <img
              src={url}
              alt={name || "Preview"}
              onLoad={() => setMediaLoading(false)}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={(e) => {
                e.stopPropagation();
                // Double click zooms in/out
                if (scale > 1) handleResetZoom();
                else setScale(1.75);
              }}
              style={{
                transform: `scale(${scale}) translate3d(${panOffset.x / scale}px, ${panOffset.y / scale}px, 0)`,
                transition: isPanning
                  ? "none"
                  : "transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                opacity: mediaLoading ? 0 : 1,
                willChange: "transform",
                cursor:
                  scale > 1 ? (isPanning ? "grabbing" : "grab") : "zoom-in",
              }}
              className="max-w-[95vw] max-h-[80vh] object-contain rounded-lg shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-white/5 select-none"
            />
          </div>
        ) : isPdf ? (
          <div
            className="relative w-full max-w-6xl h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {mediaLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded-2xl border border-white/10">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            )}
            <iframe
              src={url}
              title={name || "PDF Document"}
              onLoad={() => setMediaLoading(false)}
              className="w-full h-full border border-white/10 rounded-2xl bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-150"
              style={{ opacity: mediaLoading ? 0 : 1 }}
            />
          </div>
        ) : isOffice && isPublicUrl ? (
          <div
            className="relative w-full max-w-6xl h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {mediaLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded-2xl border border-white/10">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            )}
            <iframe
              src={officeViewerUrl}
              title={name || "Office Document"}
              onLoad={() => setMediaLoading(false)}
              className="w-full h-full border border-white/10 rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-150"
              style={{ opacity: mediaLoading ? 0 : 1 }}
            />
          </div>
        ) : isText ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl h-[80vh] border border-white/10 rounded-2xl bg-slate-950/85 p-6 overflow-auto text-left font-mono text-sm text-slate-300 whitespace-pre shadow-2xl backdrop-blur-md select-text cursor-text animate-in zoom-in-95 duration-150"
          >
            {loadingText ? (
              <div className="flex h-full w-full items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </div>
            ) : (
              textContent
            )}
          </div>
        ) : (
          /* Generic File Card Overlay */
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md border border-white/10 bg-slate-900/80 p-8 rounded-3xl shadow-2xl backdrop-blur-xl flex flex-col items-center text-center space-y-6 animate-in zoom-in-95 duration-150 cursor-default"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
              <Icon size={40} />
            </div>

            <div className="space-y-2 w-full">
              <h3 className="text-lg font-bold text-white tracking-wide truncate max-w-xs mx-auto">
                {name || "Untitled Document"}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed px-4">
                {mimeType ? `MIME Type: ${mimeType}` : "Unknown file format"}
                {size ? ` • ${(size / 1024).toFixed(1)} KB` : ""}
              </p>
              <p className="text-xs text-slate-500 italic px-4">
                Full-screen browser preview is not supported for this file type.
                Please download or open it in a new tab to view its contents.
              </p>
            </div>

            <div className="pt-2 flex gap-3 w-full justify-center">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold tracking-wide text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
              >
                <Download size={14} />
                Download File
              </button>

              {url && !url.startsWith("data:") && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-slate-300 font-semibold tracking-wide text-xs hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                >
                  Open in New Tab
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
