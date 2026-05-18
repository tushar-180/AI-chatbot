import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useGroupStore } from "@/features/chat/store/useGroupStore";
import { Loader2, X, CheckCircle2, UserPlus } from "lucide-react";
import Sidebar from "@/features/chat/components/Sidebar";
import { toast } from "sonner";
import { useUser } from "@clerk/react";

const JoinGroupPage = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const { user } = useUser();
  const addGroup = useGroupStore((state) => state.addGroup);

  const isAlreadyMember = group?.members?.some((m: any) => m.userId === user?.id);

  useEffect(() => {
    if (inviteCode) {
      api.get(`/group/invite/${inviteCode}`)
        .then((res) => {
          setGroup(res.data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Fetch group error:", err);
          toast.error("Invalid invite link");
          navigate("/chat");
        });
    }
  }, [inviteCode, navigate]);



  const handleJoin = async () => {
    if (!user) return;
    setJoining(true);
    try {
      const res = await api.post(`/group/join/${inviteCode}`, { userId: user.id });
      addGroup(res.data);
      toast.success(`Joined ${res.data.title}`);
      navigate(`/group/${res.data._id}`);
    } catch (err) {
      toast.error("Failed to join group");
      setJoining(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />
      
      <main className="relative flex flex-1 flex-col items-center justify-center bg-linear-to-br from-[#030712] via-[#0f172a]/40 to-[#030712] p-4">
        {/* Modal-style join container */}
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
          
          {/* Header */}
          <div className="px-6 py-6 border-b border-zinc-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                {isAlreadyMember ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <UserPlus className="w-5 h-5 text-emerald-500" />
                )}
              </div>
              <h2 className="text-lg font-medium text-white tracking-tight">
                {isAlreadyMember ? "Already In Group" : "Join Group Chat"}
              </h2>
            </div>
            <button
              onClick={() => navigate("/chat")}
              className="p-2 hover:bg-zinc-900 rounded-full transition-colors text-zinc-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                <p className="text-zinc-400 text-sm font-medium">Fetching group details...</p>
              </div>
            ) : isAlreadyMember ? (
              <>
                <div className="space-y-2">
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    You are already a member of this collaborative group session.
                  </p>
                </div>

                <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-center space-y-1">
                  <h3 className="text-xl font-bold text-white truncate px-2">{group?.title}</h3>
                  <p className="text-[10px] text-emerald-500 uppercase tracking-[0.2em] font-bold">
                    Already In Group
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => navigate(`/group/${group._id}`)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-black/20"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Enter Conversation
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    You've been invited to join this collaborative group session. 
                    All members can see the history and participate in real-time.
                  </p>
                </div>

                <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-center space-y-1">
                  <h3 className="text-xl font-bold text-white truncate px-2">{group?.title}</h3>
                  <p className="text-[10px] text-emerald-500 uppercase tracking-[0.2em] font-bold">
                    {group?.members?.length || 0} Members Active
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-black/20"
                  >
                    {joining ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                    {joining ? "Joining Conversation..." : "Join Conversation"}
                  </button>
                  <button
                    onClick={() => navigate("/chat")}
                    className="w-full px-4 py-4 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-all border border-zinc-800"
                  >
                    Not Now
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-zinc-900/30 border-t border-zinc-900 flex items-center justify-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
              Secure Group Invitation
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default JoinGroupPage;
