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
        className="w-full max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/60 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Folder size={18} className="text-zinc-900 dark:text-white" />
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Select a project to move this chat into. Once moved, this chat will be isolated to the selected project's workspace.
          </p>

          {loading ? (
            <div className="flex justify-center p-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-500/20 border-t-zinc-900 dark:border-t-white" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center p-4 text-sm text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              You don't have any projects yet. Create a project first from the Projects Dashboard.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-2 mb-6">
              {projects.map((project) => {
                const isSelected = selectedProjectId === project._id;
                return (
                  <button
                    key={project._id}
                    type="button"
                    onClick={() => setSelectedProjectId(project._id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all w-full text-left ${
                      isSelected
                        ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-black font-semibold"
                        : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <Folder 
                      size={16} 
                      className={
                        isSelected 
                          ? "text-white dark:text-black" 
                          : "text-zinc-400 dark:text-zinc-500"
                      } 
                    />
                    <span className="font-medium text-sm">{project.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedProjectId || isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isSubmitting ? "Moving..." : "Move Chat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
