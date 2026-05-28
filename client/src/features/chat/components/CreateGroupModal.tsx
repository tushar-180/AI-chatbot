import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Loader2, Users, Link as LinkIcon } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useGroupStore } from "../store/useGroupStore";
import { useChatStore } from "../store/useChatStore";
import { useProjectStore } from "../store/useProjectStore";
import { useNavigate } from "react-router-dom";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose, chatId }) => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [hasFinalizedConversion, setHasFinalizedConversion] = useState(false);
  const addGroup = useGroupStore((state) => state.addGroup);
  const setCurrentGroup = useGroupStore((state) => state.setCurrentGroup);
  const removeChat = useChatStore((state) => state.removeChat);
  const setCurrentChat = useChatStore((state) => state.setCurrentChat);
  const removeChatFromProjectStore = useProjectStore(
    (state) => state.removeChatFromProjectStore,
  );

  const finalizeGroupCreation = () => {
    if (!createdGroupId || hasFinalizedConversion) {
      return;
    }

    setHasFinalizedConversion(true);
    removeChat(chatId);
    removeChatFromProjectStore(chatId);
    setCurrentChat(null);
    setCurrentGroup(createdGroupId);
    navigate(`/group/${createdGroupId}`);
  };

  const handleClose = () => {
    finalizeGroupCreation();
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    } else {
      setCopied(false);
      setInviteUrl(null);
      setCreatedGroupId(null);
      setHasFinalizedConversion(false);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, isOpen]);

  const handleGenerateLink = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const response = await api.post("/group/create", { 
        chatId,
        userId: user.id
      });
      const group = response.data;
      
      addGroup(group);
      setCreatedGroupId(group._id);
      
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/join/${group.inviteCode}`;
      setInviteUrl(url);
      
      toast.success("Group created successfully!");
    } catch (error) {
      console.error("Create Group Error:", error);
      toast.error("Failed to create group");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Invite link copied!");
      setTimeout(() => {
        handleClose();
      }, 1000);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="px-6 py-6 border-b border-zinc-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Users className="w-5 h-5 text-emerald-500" />
            </div>
            <h2 className="text-lg font-medium text-white tracking-tight">
              Create Group Chat
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-zinc-900 rounded-full transition-colors text-zinc-500 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            {inviteUrl 
              ? "Share this invite link with others to join your group chat." 
              : "Turn this private chat into a collaborative group session. All participants can view history and send messages."}
          </p>
          
          <div className="space-y-3">
            {!inviteUrl ? (
              <button
                onClick={handleGenerateLink}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4" />
                )}
                {isLoading ? "Creating Group..." : "Generate Invite Link"}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <span className="flex-1 text-xs text-zinc-400 truncate font-mono">
                    {inviteUrl}
                  </span>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-all"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy Invite Link"}
                </button>
              </div>
            )}
            
            <button
              onClick={handleClose}
              className="w-full px-4 py-3 bg-zinc-900 text-white font-medium rounded-xl hover:bg-zinc-800 transition-all border border-zinc-800"
            >
              {inviteUrl ? "Done" : "Cancel"}
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-zinc-900/30 border-t border-zinc-900 flex items-center justify-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
                Collaborative Group Session
            </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default CreateGroupModal;
