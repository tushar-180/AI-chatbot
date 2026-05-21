import { useState, useEffect } from "react";
import { Folder, X } from "lucide-react";
import { useProjectStore } from "../store/useProjectStore";

interface MoveToProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (projectId: string) => Promise<void>;
  title?: string;
}

export default function MoveToProjectModal({
  isOpen,
  onClose,
  onMove,
  title = "Move Chat to Project",
}: MoveToProjectModalProps) {
  const { projects, fetchProjects, loading } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
      setSelectedProjectId("");
    }
  }, [isOpen, fetchProjects]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    
    setIsSubmitting(true);
    try {
      await onMove(selectedProjectId);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div 
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Folder size={18} className="text-emerald-400" />
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-sm text-slate-400 mb-4">
            Select a project to move this chat into. Once moved, this chat will be isolated to the selected project's workspace.
          </p>

          {loading ? (
            <div className="flex justify-center p-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center p-4 text-sm text-slate-500 bg-slate-800/50 rounded-xl border border-white/5">
              You don't have any projects yet. Create a project first from the Projects Dashboard.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-2 mb-6">
              {projects.map((project) => (
                <button
                  key={project._id}
                  type="button"
                  onClick={() => setSelectedProjectId(project._id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all w-full text-left ${
                    selectedProjectId === project._id
                      ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-100"
                      : "bg-slate-800/50 border-transparent hover:bg-slate-800 text-slate-300"
                  }`}
                >
                  <Folder size={16} className={selectedProjectId === project._id ? "text-emerald-400" : "text-slate-500"} />
                  <span className="font-medium text-sm">{project.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedProjectId || isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Moving..." : "Move Chat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
