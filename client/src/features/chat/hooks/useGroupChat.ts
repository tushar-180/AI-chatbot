import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGroupStore } from "../store/useGroupStore";
import { api, API_ORIGIN } from "@/lib/api";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";
import axios from "axios";

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
    isAiThinking,
    setIsAiThinking,
    setIsWebSearching,
  } = useGroupStore();

  const socketRef = useRef<Socket | null>(null);
  const [typingUsers, setTypingUsers] = useState<
    Array<{ userId: string; username: string }>
  >([]);

  const displayedContentRef = useRef<string>("");
  const targetContentRef = useRef<string>("");
  const typewriterFrameRef = useRef<number | null>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const isDoneRef = useRef<boolean>(false);
  const finalMessageRef = useRef<any>(null);
  const stopRequestedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!groupId || !user?.id) return;

    setCurrentGroup(groupId);
    setLoading(true);
    setTypingUsers([]);

    displayedContentRef.current = "";
    targetContentRef.current = "";
    activeStreamIdRef.current = null;
    isDoneRef.current = false;
    finalMessageRef.current = null;
    stopRequestedRef.current = false;
    if (typewriterFrameRef.current !== null) {
      cancelAnimationFrame(typewriterFrameRef.current);
      typewriterFrameRef.current = null;
    }

    // Fetch initial messages
    api
      .get(`/group/${groupId}/messages`, { params: { userId: user.id } })
      .then((res) => {
        setGroupMessages(res.data.messages);
        setLoading(false);
      });

    // Setup Socket.io
    const socket = io(API_ORIGIN, {
      query: {
        groupId,
        userId: user.id,
      },
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on(
      "user_typing",
      (data: { userId: string; username: string; isTyping: boolean }) => {
        setTypingUsers((prev) => {
          if (data.isTyping) {
            if (prev.some((u) => u.userId === data.userId)) return prev;
            return [...prev, { userId: data.userId, username: data.username }];
          } else {
            return prev.filter((u) => u.userId !== data.userId);
          }
        });
      },
    );

    socket.on("group_event", (data) => {
      const startTypewriter = (
        tempId: string,
        username: string,
        webSearchEnabled?: boolean,
      ) => {
        if (typewriterFrameRef.current !== null) return;

        const tick = () => {
          const target = targetContentRef.current;
          const current = displayedContentRef.current;

          if (current.length < target.length) {
            const remainingLength = target.length - current.length;
            // Catch up speed divisor: use slightly faster division once done to keep transition quick but smooth
            const divisor = isDoneRef.current ? 6 : 8;
            const charsPerFrame = Math.max(
              1,
              Math.min(8, Math.ceil(remainingLength / divisor)),
            );
            displayedContentRef.current = target.substring(
              0,
              current.length + charsPerFrame,
            );

            setGroupMessages((prev) => {
              const existing = prev.find((m) => m._id === tempId);
              if (existing) {
                return prev.map((m) =>
                  m._id === tempId
                    ? {
                        ...m,
                        content: displayedContentRef.current,
                        username: username || m.username,
                        metadata: webSearchEnabled
                          ? { webSearchEnabled: true }
                          : m.metadata,
                        sources: m.sources,
                        isWebSearching: m.isWebSearching,
                      }
                    : m,
                );
              } else {
                const streamingMessage = {
                  _id: tempId,
                  groupId,
                  userId: "assistant",
                  username: username || "Velora",
                  role: "assistant" as const,
                  content: displayedContentRef.current,
                  status: "streaming" as const,
                  type: "text" as const,
                  createdAt: new Date().toISOString(),
                  metadata: webSearchEnabled ? { webSearchEnabled: true } : {},
                  sources: [],
                  isWebSearching: false,
                };
                return [...prev, streamingMessage];
              }
            });

            typewriterFrameRef.current = requestAnimationFrame(tick);
          } else {
            typewriterFrameRef.current = null;

            // If the server was finished, commit the final message now that we have fully caught up!
            if (isDoneRef.current && finalMessageRef.current) {
              const finalMsg = finalMessageRef.current;
              setGroupMessages((prev) => [
                ...prev.filter((m) => m._id !== tempId),
                finalMsg,
              ]);
              isDoneRef.current = false;
              finalMessageRef.current = null;
              displayedContentRef.current = "";
              targetContentRef.current = "";
              activeStreamIdRef.current = null;
            }
          }
        };

        typewriterFrameRef.current = requestAnimationFrame(tick);
      };

      if (data.type === "message") {
        addGroupMessage(data.message);
      } else if (data.type === "ai_stream") {
        if (stopRequestedRef.current) return;
        if (useGroupStore.getState().isAiThinking) {
          setIsAiThinking(false);
        }
        if (data.done) {
          isDoneRef.current = true;
          finalMessageRef.current = data.message;
          targetContentRef.current = data.message.content || "";

          if (groupId) {
            updateGroup(groupId, {
              updatedAt: data.message.createdAt || new Date().toISOString(),
            });
          }

          // If the typewriter has already completed, swap immediately
          if (typewriterFrameRef.current === null) {
            setGroupMessages((prev) => [
              ...prev.filter((m) => m._id !== data.tempId),
              data.message,
            ]);
            isDoneRef.current = false;
            finalMessageRef.current = null;
            displayedContentRef.current = "";
            targetContentRef.current = "";
            activeStreamIdRef.current = null;
          } else {
            // Kickstart to ensure catching up to final content
            startTypewriter(data.tempId, data.username, data.webSearchEnabled);
          }
        } else if (data.sources) {
          // If we receive sources, set them directly on the matching streaming message
          setGroupMessages((prev) => {
            const existing = prev.find((m) => m._id === data.tempId);
            if (existing) {
              return prev.map((m) =>
                m._id === data.tempId
                  ? {
                      ...m,
                      sources: data.sources,
                      isWebSearching: false,
                    }
                  : m,
              );
            } else {
              const streamingMessage = {
                _id: data.tempId,
                groupId,
                userId: "assistant",
                username: data.username || "Velora",
                role: "assistant" as const,
                content: "",
                status: "streaming" as const,
                type: "text" as const,
                createdAt: new Date().toISOString(),
                metadata: { webSearchEnabled: true },
                sources: data.sources,
                isWebSearching: false,
              };
              return [...prev, streamingMessage];
            }
          });
        } else {
          // Adaptive Catch-Up Typewriter Stream Handler
          if (activeStreamIdRef.current !== data.tempId) {
            activeStreamIdRef.current = data.tempId;
            targetContentRef.current = data.chunk || "";
            displayedContentRef.current = "";
          } else {
            targetContentRef.current += data.chunk || "";
          }

          startTypewriter(data.tempId, data.username, data.webSearchEnabled);
        }
      } else if (data.type === "member_joined") {
        // Update members list
        const activeGroups = useGroupStore.getState().groups;
        const group = activeGroups.find((g) => g._id === groupId);
        if (group) {
          const updatedMembers = [...group.members, data.member];
          updateGroupMembers(groupId, updatedMembers);
        }
      } else if (data.type === "member_left") {
        if (data.userId === user?.id) {
          socket.disconnect();
          toast.warning(
            data.reason === "removed"
              ? "You have been removed from this group by the admin."
              : "You have left the group.",
          );
          navigate("/chat");
          return;
        }
        const activeGroups = useGroupStore.getState().groups;
        const group = activeGroups.find((g) => g._id === groupId);
        if (group) {
          const updatedMembers = group.members.filter(
            (m) => m.userId !== data.userId,
          );
          updateGroupMembers(groupId, updatedMembers);
        }
      } else if (data.type === "admin_changed") {
        updateGroup(groupId, { creatorId: data.creatorId });
      } else if (data.type === "group_deleted") {
        socket.disconnect();
        toast.warning("This group chat was deleted by its creator.");
        navigate("/chat");
      } else if (data.type === "ai_thinking") {
        setIsAiThinking(data.isThinking);
        if (data.isThinking) {
          setIsWebSearching(!!data.webSearchEnabled);
        } else {
          setIsWebSearching(false);
        }
      } else if (data.type === "message_updated") {
        setGroupMessages((prev) =>
          prev.map((m) => (m._id === data.message._id ? data.message : m))
        );
      } else if (data.type === "messages_deleted_after") {
        const threshold = new Date(data.createdAt).getTime();
        setGroupMessages((prev) =>
          prev.filter((m) => {
            const t = new Date(m.createdAt).getTime();
            if (data.inclusive) {
              return t < threshold && m._id !== data.messageId;
            }
            return t <= threshold;
          })
        );
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Socket Connection Error:", err);
      setIsAiThinking(false);
      setIsWebSearching(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsAiThinking(false);
      setIsWebSearching(false);
      if (typewriterFrameRef.current !== null) {
        cancelAnimationFrame(typewriterFrameRef.current);
      }
    };
  }, [
    groupId,
    user?.id,
    setCurrentGroup,
    setGroupMessages,
    addGroupMessage,
    setLoading,
    updateGroupMembers,
    updateGroup,
    navigate,
    setIsAiThinking,
    setIsWebSearching,
  ]);

  const sendMessage = async (
    content: string,
    webSearchEnabled?: boolean,
    attachments?: any[],
    attachedFile?: File | null,
  ) => {
    if (
      !groupId ||
      (!content.trim() && (!attachments || attachments.length === 0) && !attachedFile) ||
      !user?.id
    )
      return;
    stopRequestedRef.current = false;
    try {
      if (attachedFile) {
        const formData = new FormData();
        formData.append("content", content);
        formData.append("userId", user.id);
        if (webSearchEnabled) formData.append("webSearchEnabled", "true");
        if (attachments && attachments.length > 0) formData.append("attachments", JSON.stringify(attachments));
        formData.append("file", attachedFile);

        await api.post(`/group/${groupId}/message`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await api.post(`/group/${groupId}/message`, {
          content,
          userId: user.id,
          webSearchEnabled,
          attachments,
        });
      }
    } catch (err) {
      console.error("Error sending message:", err);
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

    // Immediately clear thinking/searching state so the stop button + indicator disappear at once
    setIsAiThinking(false);
    setIsWebSearching(false);

    // Immediately stop typewriter animation
    if (typewriterFrameRef.current !== null) {
      cancelAnimationFrame(typewriterFrameRef.current);
      typewriterFrameRef.current = null;
    }

    stopRequestedRef.current = true;

    // Instantly freeze the active streaming message at its current content and mark as stopped
    setGroupMessages((prev) =>
      prev.map((m) =>
        m.status === "streaming"
          ? {
              ...m,
              content:
                displayedContentRef.current ||
                m.content ||
                "⚠️ Response generation stopped.",
              status: "stopped" as const,
            }
          : m,
      ),
    );

    // Reset typewriter state refs to block any delayed socket updates
    isDoneRef.current = false;
    finalMessageRef.current = null;
    displayedContentRef.current = "";
    targetContentRef.current = "";
    activeStreamIdRef.current = null;

    try {
      await api.post(`/group/${groupId}/stop`);
    } catch (err) {
      console.error("Error stopping stream:", err);
    }
  };

  const editMessage = async (messageId: string, content: string) => {
    if (!groupId || !content.trim()) return;
    try {
      await api.patch(`/group/${groupId}/messages/${messageId}`, {
        content,
        webSearchEnabled: false,
      });
    } catch (err) {
      console.error("Error editing group message:", err);
    }
  };

  const retryMessage = async (messageId: string) => {
    if (!groupId) return;

    const storeState = useGroupStore.getState();
    const currentMessages = storeState.groupMessages;
    const messageIndex = currentMessages.findIndex((m) => m._id === messageId);

    if (messageIndex === -1) return;

    const messageToRetry = currentMessages[messageIndex];

    if (messageToRetry.role !== "assistant") return;

    const hasActiveStream =
      storeState.isAiThinking ||
      currentMessages.some((m) => m.status === "streaming");

    if (hasActiveStream) {
      await stopStream();
    }

    const previousMessages = useGroupStore.getState().groupMessages;
    const previousUserMessage = [...previousMessages]
      .slice(0, messageIndex)
      .reverse()
      .find((m) => m.role === "user");

    const webSearchEnabled = Boolean(
      previousUserMessage?.metadata?.webSearchEnabled,
    );

    stopRequestedRef.current = false;

    if (typewriterFrameRef.current !== null) {
      cancelAnimationFrame(typewriterFrameRef.current);
      typewriterFrameRef.current = null;
    }

    displayedContentRef.current = "";
    targetContentRef.current = "";
    activeStreamIdRef.current = null;
    isDoneRef.current = false;
    finalMessageRef.current = null;

    // Remove the assistant message (and anything after it) so the
    // isAiThinking loader is the only visible indicator. The typewriter
    // handler will create a fresh streaming message once chunks arrive.
    setGroupMessages((prev) => prev.slice(0, messageIndex));
    setIsAiThinking(true);
    setIsWebSearching(webSearchEnabled);

    try {
      await api.post(`/group/${groupId}/messages/${messageId}/retry`, {});
    } catch (err) {
      setGroupMessages(previousMessages);
      setIsAiThinking(false);
      setIsWebSearching(false);
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || "Failed to retry the AI response."
        : "Failed to retry the AI response.";
      toast.error(errorMessage);
      console.error("Error retrying group message:", err);
    }
  };

  const updateMessageFeedback = async (
    messageId: string,
    feedback: "like" | "dislike" | null,
  ) => {
    if (!groupId) return;
    try {
      // Optimistically update the message locally so the thumbs up/down change color instantly!
      setGroupMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, feedback } : m)),
      );
      await api.patch(`/group/${groupId}/messages/${messageId}/feedback`, {
        feedback,
      });
    } catch (err) {
      console.error("Error updating group message feedback:", err);
    }
  };

  const sendTypingStatus = (isTyping: boolean) => {
    if (socketRef.current && user?.id) {
      const username =
        user.firstName ||
        user.username ||
        user.primaryEmailAddress?.emailAddress.split("@")[0] ||
        "Someone";
      socketRef.current.emit("typing", {
        isTyping,
        username,
      });
    }
  };

  return {
    sendMessage,
    leaveGroup,
    stopStream,
    sendTypingStatus,
    editMessage,
    retryMessage,
    updateMessageFeedback,
    typingUsers,
    isStreaming:
      isAiThinking || groupMessages.some((m) => m.status === "streaming"),
    currentGroup: groups.find((g) => g._id === groupId),
  };
};
