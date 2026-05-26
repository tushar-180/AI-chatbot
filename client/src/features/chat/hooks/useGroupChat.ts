import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGroupStore } from "../store/useGroupStore";
import { api, API_ORIGIN } from "@/lib/api";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";
import axios from "axios";

let activeSocket: Socket | null = null;
let activeTypewriterFrame: number | null = null;

export const cleanupGroupChatStream = () => {
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
  }
  if (activeTypewriterFrame !== null) {
    cancelAnimationFrame(activeTypewriterFrame);
    activeTypewriterFrame = null;
  }

  try {
    const store = useGroupStore.getState();
    const currentGroupId = store.currentGroupId;
    if (currentGroupId) {
      store.setIsAiThinking(false, currentGroupId);
      store.setIsWebSearching(false, currentGroupId);
      store.setGroupMessages((prev) =>
        prev.map((m) =>
          m.status === "streaming"
            ? {
                ...m,
                content: m.content || "⚠️ Response generation stopped.",
                status: "stopped" as const,
              }
            : m
        )
      );
    }
  } catch (err) {
    console.error("Error during cleanupGroupChatStream:", err);
  }
};

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
  const lastUpdateRef = useRef<number>(0);
  const isUnmountedRef = useRef<boolean>(false);
  const lastGroupIdRef = useRef<string | null>(null);

  // Synchronous route change cleanup during render phase to instantly unblock navigation
  if (groupId !== lastGroupIdRef.current) {
    if (socketRef.current) {
      socketRef.current.disconnect();
      if (activeSocket === socketRef.current) {
        activeSocket = null;
      }
      socketRef.current = null;
    }
    if (typewriterFrameRef.current !== null) {
      cancelAnimationFrame(typewriterFrameRef.current);
      if (activeTypewriterFrame === typewriterFrameRef.current) {
        activeTypewriterFrame = null;
      }
      typewriterFrameRef.current = null;
    }
    isUnmountedRef.current = true;
    lastGroupIdRef.current = groupId || null;
  }

  useEffect(() => {
    if (!groupId || !user?.id) return;

    isUnmountedRef.current = false;
    lastGroupIdRef.current = groupId;
    const connectionGroupId = groupId;

    setCurrentGroup(groupId);
    setLoading(true);
    setTypingUsers([]);

    displayedContentRef.current = "";
    targetContentRef.current = "";
    activeStreamIdRef.current = null;
    isDoneRef.current = false;
    finalMessageRef.current = null;
    stopRequestedRef.current = false;
    lastUpdateRef.current = 0;
    if (typewriterFrameRef.current !== null) {
      cancelAnimationFrame(typewriterFrameRef.current);
      typewriterFrameRef.current = null;
    }

    // Fetch initial messages
    api
      .get(`/group/${groupId}/messages`, { params: { userId: user.id } })
      .then((res) => {
        if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return;
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
    activeSocket = socket;

    socket.on(
      "user_typing",
      (data: { userId: string; username: string; isTyping: boolean }) => {
        if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return;
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
      if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return;

      const startTypewriter = (
        tempId: string,
        username: string,
        webSearchEnabled?: boolean,
      ) => {
        if (typewriterFrameRef.current !== null) return;

        const tick = () => {
          if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return;
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

            // Throttle state updates to around ~50ms to avoid blocking UI clicks
            const now = performance.now();
            const timeSinceLastUpdate = now - lastUpdateRef.current;
            const isFinished = displayedContentRef.current.length === target.length;
            const shouldForceUpdate = isFinished && isDoneRef.current;

            if (timeSinceLastUpdate >= 50 || shouldForceUpdate) {
              lastUpdateRef.current = now;
              setGroupMessages((prev) => {
                if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return prev;
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
            }

            typewriterFrameRef.current = requestAnimationFrame(tick);
            activeTypewriterFrame = typewriterFrameRef.current;
          } else {
            typewriterFrameRef.current = null;
            activeTypewriterFrame = null;

            // If the server was finished, commit the final message now that we have fully caught up!
            if (isDoneRef.current && finalMessageRef.current) {
              const finalMsg = finalMessageRef.current;
              setGroupMessages((prev) => {
                if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return prev;
                return [
                  ...prev.filter((m) => m._id !== tempId),
                  finalMsg,
                ];
              });
              isDoneRef.current = false;
              finalMessageRef.current = null;
              displayedContentRef.current = "";
              targetContentRef.current = "";
              activeStreamIdRef.current = null;
            }
          }
        };

        typewriterFrameRef.current = requestAnimationFrame(tick);
        activeTypewriterFrame = typewriterFrameRef.current;
      };

      if (data.type === "message") {
        addGroupMessage(data.message);
      } else if (data.type === "ai_stream") {
        if (stopRequestedRef.current) return;
        if (useGroupStore.getState().isAiThinking) {
          setIsAiThinking(false, groupId);
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
            setGroupMessages((prev) => {
              if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return prev;
              return [
                ...prev.filter((m) => m._id !== data.tempId),
                data.message,
              ];
            });
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
            if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return prev;
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
            const existingMessage = useGroupStore.getState().groupMessages.find((m) => m._id === data.tempId);
            const baseContent = existingMessage?.content || "";
            displayedContentRef.current = baseContent;
            targetContentRef.current = baseContent + (data.chunk || "");
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
        setIsAiThinking(data.isThinking, groupId, data.requesterId);
        if (data.isThinking) {
          setIsWebSearching(!!data.webSearchEnabled, groupId);
        } else {
          setIsWebSearching(false, groupId);
        }
      } else if (data.type === "message_updated") {
        setGroupMessages((prev) => {
          if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return prev;
          return prev.map((m) => (m._id === data.message._id ? data.message : m));
        });
      } else if (data.type === "messages_deleted_after") {
        const threshold = new Date(data.createdAt).getTime();
        setGroupMessages((prev) => {
          if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return prev;
          return prev.filter((m) => {
            const t = new Date(m.createdAt).getTime();
            if (data.inclusive) {
              return t < threshold && m._id !== data.messageId;
            }
            return t <= threshold;
          });
        });
      }
    });

    socket.on("connect_error", (err) => {
      if (isUnmountedRef.current || lastGroupIdRef.current !== connectionGroupId) return;
      console.error("Socket Connection Error:", err);
      setIsAiThinking(false, groupId);
      setIsWebSearching(false, groupId);
    });

    socketRef.current = socket;

    return () => {
      isUnmountedRef.current = true;
      socket.disconnect();
      if (activeSocket === socket) {
        activeSocket = null;
      }
      socketRef.current = null;
      setIsAiThinking(false, groupId);
      setIsWebSearching(false, groupId);
      if (typewriterFrameRef.current !== null) {
        cancelAnimationFrame(typewriterFrameRef.current);
        if (activeTypewriterFrame === typewriterFrameRef.current) {
          activeTypewriterFrame = null;
        }
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
    setIsAiThinking(false, groupId);
    setIsWebSearching(false, groupId);

    // Immediately stop typewriter animation
    if (typewriterFrameRef.current !== null) {
      cancelAnimationFrame(typewriterFrameRef.current);
      if (activeTypewriterFrame === typewriterFrameRef.current) {
        activeTypewriterFrame = null;
      }
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

  const editMessage = async (
    messageId: string,
    content: string,
    webSearchEnabled = false,
    attachments: any[] = [],
    attachedFile: File | null = null
  ) => {
    if (!groupId || !content.trim()) return;

    // Optimistic update for immediate UI feedback
    setGroupMessages((prev) =>
      prev.map((m) =>
        m._id === messageId
          ? {
              ...m,
              content,
              updatedAt: new Date(
                Math.max(Date.now(), new Date(m.createdAt).getTime() + 3000)
              ).toISOString(),
            }
          : m
      )
    );

    try {
      if (attachedFile) {
        const formData = new FormData();
        formData.append("content", content);
        formData.append("webSearchEnabled", String(webSearchEnabled));
        formData.append("attachments", JSON.stringify(attachments));
        formData.append("file", attachedFile);

        await api.patch(`/group/${groupId}/messages/${messageId}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await api.patch(`/group/${groupId}/messages/${messageId}`, {
          content,
          webSearchEnabled: !!webSearchEnabled,
          attachments,
        });
      }
    } catch (err) {
      console.error("Error editing group message:", err);
    }
  };

  const retryMessage = async (messageId: string, provider?: string, webSearchEnabledParam?: boolean) => {
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

    const webSearchEnabled = webSearchEnabledParam !== undefined 
      ? webSearchEnabledParam 
      : Boolean(previousUserMessage?.metadata?.webSearchEnabled);

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
      await api.post(`/group/${groupId}/messages/${messageId}/retry`, {
        targetProvider: provider,
        webSearchEnabled,
      });
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
    if (!groupId || !user?.id) return;

    const username =
      user.firstName ||
      user.username ||
      user.primaryEmailAddress?.emailAddress.split("@")[0] ||
      "User";

    try {
      // Optimistically update the reactions array locally
      setGroupMessages((prev) =>
        prev.map((m) => {
          if (m._id !== messageId) return m;
          const currentReactions = m.reactions || [];
          // Remove any existing reaction by this user
          const filtered = currentReactions.filter((r) => r.userId !== user.id);
          // Add the new reaction if not null
          const updated = feedback
            ? [...filtered, { userId: user.id!, username, type: feedback }]
            : filtered;
          return { ...m, reactions: updated };
        }),
      );
      await api.patch(`/group/${groupId}/messages/${messageId}/feedback`, {
        feedback,
        userId: user.id,
        username,
      });
    } catch (err) {
      console.error("Error updating group message reaction:", err);
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
    isStreaming: (() => {
      const isGlobalStreaming = isAiThinking || groupMessages.some((m) => m.status === "streaming");
      if (!isGlobalStreaming) return false;
      
      const storeState = useGroupStore.getState();
      const currentRequesterId = storeState.aiThinkingRequesterIds[groupId || ""];
      if (currentRequesterId) {
        return currentRequesterId === user?.id;
      }
      
      // Fallback if requesterId isn't present in state
      const lastUserMsg = [...groupMessages].reverse().find(m => m.role === "user");
      return lastUserMsg?.userId === user?.id;
    })(),
    currentGroup: groups.find((g) => g._id === groupId),
  };
};
