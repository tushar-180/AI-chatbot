import React, { useState, memo } from "react";
import { createPortal } from "react-dom";
import { Menu, Users, LogOut, X } from "lucide-react";
import { useGroupStore } from "../store/useGroupStore";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { UserButton, useUser } from "@clerk/react";

import DeleteConfirmModal from "./DeleteConfirmModal";

interface GroupChatHeaderProps {
  onMenuClick: () => void;
  groupId: string;
}

const GroupChatHeader: React.FC<GroupChatHeaderProps> = ({ onMenuClick, groupId }) => {
  const { groups, removeGroup } = useGroupStore();
  const { user: currentUser } = useUser();
  const group = groups.find((g) => g._id === groupId);
  const [showMembers, setShowMembers] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const navigate = useNavigate();

  const handleLeave = async () => {
    if (!currentUser) return;
    try {
      await api.post(`/group/${groupId}/leave`, { userId: currentUser.id });
      removeGroup(groupId);
      toast.success("Left group successfully");
      navigate("/chat");
    } catch (err) {
      console.error("Failed to leave group:", err);
      toast.error("Failed to leave group");
    }
  };

  const handleRemoveMember = async (memberId: string, username: string) => {
    if (!currentUser) return;
    try {
      await api.post(`/group/${groupId}/remove-member`, { 
        memberId, 
        userId: currentUser.id 
      });
      toast.success(`Removed ${username} from the group`);
    } catch (err) {
      console.error("Failed to remove member:", err);
      toast.error("Failed to remove member");
    }
  };

  if (!group) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#030712] not-selectable">
      <div className="mx-auto flex h-14 items-center justify-between px-6 md:px-8">
        {/* Left Section */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={onMenuClick}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-500 hover:text-white md:hidden"
          >
            <Menu size={16} />
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-emerald-500" />
              <h1 className="font-sans text-[14px] font-medium tracking-tight text-white/90 truncate">
                {group.title}
              </h1>
            </div>
            <div className="h-1 w-1 rounded-full bg-white/20" />
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
              {group.members.length} Members
            </span>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => setShowMembers(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-emerald-400"
            title="Group Members"
          >
            <Users size={16} />
          </button>

          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400"
            title="Leave Group"
          >
            <LogOut size={16} />
          </button>

          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "h-7 w-7",
                userButtonTrigger: "h-8 w-8",
              },
            }}
          />
        </div>
      </div>

      {/* Members Modal */}
      {showMembers && createPortal(
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
          onClick={() => setShowMembers(false)}
        >
          <div 
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-200" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <Users className="w-4 h-4 text-emerald-500" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-white">Group Members</h2>
              </div>
              <button 
                onClick={() => setShowMembers(false)} 
                className="p-2 hover:bg-zinc-900 rounded-full transition-colors text-zinc-500 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-2 max-h-[60vh] overflow-y-auto">
              {group.members.map((member) => (
                <div key={member.userId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all group">
                  <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-500 group-hover:border-emerald-500/30 transition-colors overflow-hidden flex-shrink-0">
                    {member.userImage ? (
                      <img src={member.userImage} alt={member.username} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold uppercase">{member.username.substring(0, 2)}</span>
                    )}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium text-white truncate">{member.username}</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {member.userId === group.creatorId && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[8px] font-bold uppercase tracking-tighter flex-shrink-0">
                      Admin
                    </span>
                  )}
                  {member.userId !== group.creatorId && currentUser?.id === group.creatorId && (
                    <button
                      onClick={() => handleRemoveMember(member.userId, member.username)}
                      className="opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-600 hover:text-white transition-all text-[9px] font-bold uppercase tracking-wider cursor-pointer flex-shrink-0"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 py-4 bg-zinc-900/30 border-t border-zinc-900 flex items-center justify-center">
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">
                {group.members.length} Active Participants
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Leave Group Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeave}
        purpose="Leave"
        title="Leave Group"
        message="Are you sure you want to leave this group chat?"
      />
    </header>
  );
};

export default memo(GroupChatHeader);
