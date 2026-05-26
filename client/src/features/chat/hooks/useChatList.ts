import { useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { api } from "@/lib/api";
import { useServerStatus } from "@/contexts/ServerStatusContext";
import { useProjectStore } from "@/features/chat/store/useProjectStore";

export const useChatList = ({ shouldFetch = false } = {}) => {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const fetchedUserIdRef = useRef<string | null>(null);
  const chats = useChatStore((state) => state.chats);
  const currentChatId = useChatStore((state) => state.currentChatId);
  const loading = useChatStore((state) => state.loading);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const isNewChat = useChatStore((state) => state.isNewChat);
  const page = useChatStore((state) => state.page);
  const hasMore = useChatStore((state) => state.hasMore);
  const setChats = useChatStore((state) => state.setChats);
  const appendChats = useChatStore((state) => state.appendChats);
  const setHasMore = useChatStore((state) => state.setHasMore);
  const setPage = useChatStore((state) => state.setPage);
  const setCurrentChat = useChatStore((state) => state.setCurrentChat);
  const setMessages = useChatStore((state) => state.setMessages);
  const setIsNewChat = useChatStore((state) => state.setIsNewChat);
  const setSidebarOpen = useChatStore((state) => state.setSidebarOpen);
  const removeChat = useChatStore((state) => state.removeChat);
  const updateChatTitle = useChatStore((state) => state.updateChatTitle);
  const updateChatArchive = useChatStore((state) => state.updateChatArchive);
  const updateChatPin = useChatStore((state) => state.updateChatPin);
  const viewingArchived = useChatStore((state) => state.viewingArchived);
  const setViewingArchived = useChatStore((state) => state.setViewingArchived);
  const upsertChat = useChatStore((state) => state.upsertChat);
  const currentChat = useChatStore((state) => state.currentChat);
  const setLoading = useChatStore((state) => state.setLoading);

  const createChat = () => {
    setIsNewChat(true);
    setCurrentChat(null);
    setMessages([]);
    setSidebarOpen(false);
    navigate("/chat");
  };

  const deleteChat = async (chatId: string) => {
    try {
      await api.delete(`/chat/${chatId}`);
      removeChat(chatId);

      // If the deleted chat was the active one, navigate back to new chat
      if (chatId === currentChatId) {
        setCurrentChat(null);
        setMessages([]);
        setIsNewChat(true);
        navigate("/chat");
      }

      toast.success("Chat deleted successfully.");
    } catch (err) {
      console.error("Error deleting chat", err);
      toast.error("Could not delete chat.");
    }
  };
  const renameChat = async (chatId: string, title: string) => {
    try {
      await api.patch(`/chat/${chatId}`, { title });
      updateChatTitle(chatId, title);
      toast.success("Chat renamed successfully.");
    } catch (err) {
      console.error("Error renaming chat", err);
      toast.error("Could not rename chat.");
      throw err; // Propagate error to handle UI state in component
    }
  };

  const moveChatToProject = async (chatId: string, projectId: string) => {
    try {
      const chatToMove =
        chats.find((c) => c._id === chatId) ||
        (chatId === currentChatId ? currentChat : null);

      await api.patch(`/chat/${chatId}/move`, { projectId });
      removeChat(chatId);

      if (chatToMove) {
        const activeProjectId = useProjectStore.getState().activeProjectId;
        if (activeProjectId === projectId) {
          useProjectStore
            .getState()
            .addChatToProjectStore({ ...chatToMove, projectId });
        }
      }

      if (chatId === currentChatId) {
        setCurrentChat(null);
        setMessages([]);
        setIsNewChat(true);
        navigate("/chat");
      }

      toast.success("Chat moved to project successfully.");
    } catch (err) {
      console.error("Error moving chat to project", err);
      toast.error("Could not move chat to project.");
    }
  };

  const archiveChat = async (chatId: string) => {
    try {
      await api.post(`/chat/${chatId}/archive`);
      updateChatArchive(chatId, true);
      toast.success("Chat archived successfully.");

      if (chatId === currentChatId) {
        navigate("/chat");
      }
    } catch (err) {
      console.error("Error archiving chat", err);
      toast.error("Could not archive chat.");
    }
  };

  const unarchiveChat = async (chatId: string) => {
    try {
      const chat =
        chats.find((c) => c._id === chatId) ||
        (currentChatId === chatId ? currentChat : null);
      await api.post(`/chat/${chatId}/unarchive`);

      // If it was pinned, also unpin it on the server
      if (chat?.isPinned) {
        await api.post(`/chat/${chatId}/unpin`);
      }

      updateChatArchive(chatId, false);
      toast.success("Chat unarchived and restored.");
    } catch (err) {
      console.error("Error unarchiving chat", err);
      toast.error("Could not unarchive chat.");
    }
  };
  const pinChat = async (chatId: string) => {
    try {
      await api.post(`/chat/${chatId}/pin`);
      updateChatPin(chatId, true);
      toast.success("Chat pinned.");
    } catch (err) {
      console.error("Error pinning chat", err);
      toast.error("Could not pin chat.");
    }
  };

  const unpinChat = async (chatId: string) => {
    try {
      await api.post(`/chat/${chatId}/unpin`);
      updateChatPin(chatId, false);
      toast.success("Chat unpinned.");
    } catch (err) {
      console.error("Error unpinning chat", err);
      toast.error("Could not unpin chat.");
    }
  };
  const selectChat = async (chatId: string, highlight?: string) => {
    const queryStr = highlight
      ? `?highlight=${encodeURIComponent(highlight)}`
      : "";

    // If it's already the current chat, just navigate to handle highlight/focus
    if (chatId === currentChatId) {
      setSidebarOpen(false);
      navigate(`/chat/${chatId}${queryStr}`, { replace: true });
      return;
    }

    // If it's in the current sidebar list
    const existingChat = chats.find((c) => c._id === chatId);

    if (existingChat) {
      setIsNewChat(false);
      setCurrentChat(chatId, existingChat);
      setMessages([]);
      setSidebarOpen(false);
      navigate(`/chat/${chatId}${queryStr}`);
      return;
    }

    // If not in current list (maybe in other view or not loaded yet)
    try {
      const res = await api.get(`/chat/${chatId}`);
      const chat = res.data;

      // If the chat's archive status doesn't match our current view, switch views
      if (chat && chat.isArchived !== viewingArchived) {
        setViewingArchived(chat.isArchived);
      }

      setIsNewChat(false);
      upsertChat(chat); // Ensure it's in the sidebar list
      setCurrentChat(chatId, chat);
      setMessages([]);
      setSidebarOpen(false);
      navigate(`/chat/${chatId}${queryStr}`);
    } catch (err) {
      console.error("Error selecting chat", err);
      // Fallback for safety
      setIsNewChat(false);
      setCurrentChat(chatId);
      setMessages([]);
      setSidebarOpen(false);
      navigate(`/chat/${chatId}${queryStr}`);
    }
  };

  const { isDown } = useServerStatus();
  const isSharedChatRoute = location.pathname.startsWith("/shared/");

  const fetchMoreChats = useCallback(async () => {
    if (!user?.id || loading || isStreaming || !hasMore) return;

    try {
      setLoading(true);
      const nextPage = page + 1;
      const res = await api.get("/chat", {
        params: { page: nextPage, limit: 20, isArchived: viewingArchived },
      });

      const fetchedChats = res.data || [];
      if (fetchedChats.length < 20) {
        setHasMore(false);
      }

      appendChats(fetchedChats);
      setPage(nextPage);
    } catch (err) {
      console.error("Error fetching more chats", err);
    } finally {
      setLoading(false);
    }
  }, [
    user?.id,
    loading,
    isStreaming,
    hasMore,
    page,
    viewingArchived,
    setLoading,
    setHasMore,
    appendChats,
    setPage,
  ]);

  const searchChats = async (query: string) => {
    if (!query.trim()) return [];
    try {
      const res = await api.get("/chat/search", { params: { q: query } });
      return res.data || [];
    } catch (err) {
      console.error("Error searching chats", err);
      return [];
    }
  };

  const currentChatIdRef = useRef(currentChatId);
  currentChatIdRef.current = currentChatId;

  const isNewChatRef = useRef(isNewChat);
  isNewChatRef.current = isNewChat;

  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const messagesLengthRef = useRef(useChatStore.getState().messages.length);
  messagesLengthRef.current = useChatStore.getState().messages.length;

  useEffect(() => {
    if (!shouldFetch) return;

    const fetchKey = `${user?.id}-${viewingArchived}`;
    if (
      !user?.id ||
      loading ||
      isStreamingRef.current ||
      fetchedUserIdRef.current === fetchKey
    ) {
      return;
    }

    const fetchChats = async () => {
      try {
        setLoading(true);
        const res = await api.get("/chat", {
          params: { page: 1, limit: 20, isArchived: viewingArchived },
        });

        const fetchedChats = res.data || [];
        fetchedUserIdRef.current = fetchKey;
        setChats(fetchedChats);
        setPage(1);
        setHasMore(fetchedChats.length === 20);

        if (fetchedChats.length === 0) {
          if (isNewChatRef.current || messagesLengthRef.current > 0) return;
          setCurrentChat(null);
          setMessages([]);
          return;
        }

        const shouldAutoSelectFirstChat =
          !isSharedChatRoute &&
          !currentChatIdRef.current &&
          !isNewChatRef.current &&
          !loading &&
          !isStreamingRef.current &&
          messagesLengthRef.current === 0;

        if (shouldAutoSelectFirstChat) {
          setCurrentChat(fetchedChats[0]._id);
        }
      } catch (err) {
        console.error("Error fetching chats", err);
        // Only show error if server is not already confirmed down
        if (!isDown) {
          toast.error("Could not load chats.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, [
    user?.id,
    isSharedChatRoute,
    loading,
    setChats,
    setCurrentChat,
    setMessages,
    setPage,
    setHasMore,
    viewingArchived,
    shouldFetch,
    setLoading,
  ]);

  const deleteChats = async (chatIds: string[]) => {
    try {
      // For now, we delete sequentially to avoid overwhelming the server
      // and because we don't have a bulk delete endpoint yet.
      // We'll show a single toast for the entire operation.
      const deletePromises = chatIds.map((id) => api.delete(`/chat/${id}`));
      await Promise.all(deletePromises);

      chatIds.forEach((id) => removeChat(id));

      // If the current chat was among the deleted ones, reset state
      if (currentChatId && chatIds.includes(currentChatId)) {
        setCurrentChat(null);
        setMessages([]);
        setIsNewChat(true);
        navigate("/chat");
      }

      toast.success(`${chatIds.length} chats deleted successfully.`);

      // If the list is now empty but there might be more on the server, re-fetch page 1
      if (chats.length === 0 && hasMore) {
        setPage(1);
        const res = await api.get("/chat", {
          params: { page: 1, limit: 20, isArchived: viewingArchived },
        });
        const fetchedChats = res.data || [];
        setChats(fetchedChats);
        setHasMore(fetchedChats.length === 20);
      }
    } catch (err) {
      console.error("Error deleting chats", err);
      toast.error("Could not delete some chats.");
    }
  };

  return {
    chats,
    currentChatId,
    createChat,
    deleteChat,
    deleteChats,
    renameChat,
    moveChatToProject,
    archiveChat,
    unarchiveChat,
    pinChat,
    unpinChat,
    selectChat,
    fetchMoreChats,
    searchChats,
    hasMore,
    loading,
    viewingArchived,
    setViewingArchived,
    upsertChat,
    currentChat,
  };
};
