import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGroupStore } from "../store/useGroupStore";
import { api, API_BASE_URL } from "@/lib/api";
import { useUser } from "@clerk/react";
import { toast } from "sonner";

export const useGroupChat = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();

  const { 
    groups, 
    setCurrentGroup, 
    groupMessages,
    setGroupMessages, 
    addGroupMessage, 
    updateGroupMembers,
    updateGroup,
    setLoading,
    setIsAiThinking
  } = useGroupStore();
  
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!groupId || !user?.id) return;

    setCurrentGroup(groupId);
    setLoading(true);

    // Fetch initial messages
    api.get(`/group/${groupId}/messages`, { params: { userId: user.id } }).then((res) => {
      setGroupMessages(res.data.messages);
      setLoading(false);
    });

    // Setup SSE
    const baseUrl = API_BASE_URL;
    const eventSource = new EventSource(`${baseUrl}/group/${groupId}/events?userId=${user.id}`, {
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message") {
        addGroupMessage(data.message);
      } else if (data.type === "ai_stream") {
        if (useGroupStore.getState().isAiThinking) {
          setIsAiThinking(false);
        }
        if (data.done) {
          // Replace streaming message with final message
          setGroupMessages((prev) => [
            ...prev.filter((m) => m._id !== data.tempId),
            data.message,
          ]);
        } else {
          // Update or add streaming message
          setGroupMessages((prev) => {
            const existing = prev.find((m) => m._id === data.tempId);
            if (existing) {
              return prev.map((m) =>
                m._id === data.tempId
                  ? { 
                      ...m, 
                      content: m.content + data.chunk,
                      username: data.username || m.username,
                      metadata: data.webSearchEnabled ? { webSearchEnabled: true } : m.metadata 
                    }
                  : m
              );
            } else {
              const streamingMessage = {
                _id: data.tempId,
                groupId,
                userId: "assistant",
                username: data.username || "Velora",
                role: "assistant" as const,
                content: data.chunk,
                status: "streaming" as const,
                type: "text" as const,
                createdAt: new Date().toISOString(),
                metadata: data.webSearchEnabled ? { webSearchEnabled: true } : {},
              };
              return [
                ...prev,
                streamingMessage,
              ];
            }
          });
        }
      } else if (data.type === "member_joined") {
        // Update members list
        const activeGroups = useGroupStore.getState().groups;
        const group = activeGroups.find(g => g._id === groupId);
        if (group) {
          const updatedMembers = [...group.members, data.member];
          updateGroupMembers(groupId, updatedMembers);
        }
      } else if (data.type === "member_left") {
        if (data.userId === user?.id) {
          eventSource.close();
          toast.warning(data.reason === "removed" ? "You have been removed from this group by the admin." : "You have left the group.");
          navigate("/chat");
          return;
        }
        const activeGroups = useGroupStore.getState().groups;
        const group = activeGroups.find(g => g._id === groupId);
        if (group) {
          const updatedMembers = group.members.filter(m => m.userId !== data.userId);
          updateGroupMembers(groupId, updatedMembers);
        }
      } else if (data.type === "admin_changed") {
        updateGroup(groupId, { creatorId: data.creatorId });
      } else if (data.type === "group_deleted") {
        eventSource.close();
        toast.warning("This group chat was deleted by its creator.");
        navigate("/chat");
      } else if (data.type === "ai_thinking") {
        setIsAiThinking(data.isThinking);
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
      setIsAiThinking(false);
      eventSource.close();
    };

    eventSourceRef.current = eventSource;

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [groupId, user?.id, setCurrentGroup, setGroupMessages, addGroupMessage, setLoading, updateGroupMembers, updateGroup, navigate, setIsAiThinking]);


  const sendMessage = async (content: string, webSearchEnabled?: boolean) => {
    if (!groupId || !content.trim() || !user?.id) return;
    const hasAiMention = /@([a-zA-Z0-9-:_/.]+)/.test(content);
    if (hasAiMention) {
      setIsAiThinking(true);
    }
    try {
      await api.post(`/group/${groupId}/message`, { content, userId: user.id, webSearchEnabled });
    } catch (err) {
      console.error("Error sending message:", err);
      setIsAiThinking(false);
    }
  };

  const leaveGroup = async () => {
    if (!groupId || !user?.id) return;
    try {
      await api.post(`/group/${groupId}/leave`, { userId: user.id });
      // Handled via SSE and redirect in component
    } catch (err) {
      console.error("Error leaving group:", err);
    }
  };

  const stopStream = async () => {
    if (!groupId) return;
    try {
      await api.post(`/group/${groupId}/stop`);
    } catch (err) {
      console.error("Error stopping stream:", err);
    }
  };

  return {
    sendMessage,
    leaveGroup,
    stopStream,
    isStreaming: groupMessages.some((m) => m.status === "streaming"),
    currentGroup: groups.find((g) => g._id === groupId),
  };
};
