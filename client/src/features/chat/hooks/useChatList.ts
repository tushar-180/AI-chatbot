import { useEffect, useRef } from "react";
import { useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { api } from "@/lib/api";
import { useServerStatus } from "@/contexts/ServerStatusContext";

export const useChatList = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const fetchedUserIdRef = useRef<string | null>(null);
  const {
    chats,
    currentChatId,
    messages,
    loading,
    isStreaming,
    isNewChat,
    page,
    hasMore,
    setChats,
    appendChats,
    setHasMore,
    setPage,
    setCurrentChat,
    setMessages,
    setIsNewChat,
    setSidebarOpen,
    removeChat,
    updateChatTitle,
  } = useChatStore();

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
  const selectChat = (chatId: string) => {
    if (chatId === currentChatId) {
      setSidebarOpen(false);
      return;
    }

    setIsNewChat(false);
    setCurrentChat(chatId);
    setMessages([]); // Clear messages immediately for smoother transition
    setSidebarOpen(false);
    navigate(`/chat/${chatId}`);
  };

  const { isDown } = useServerStatus();

  const fetchMoreChats = async () => {
    if (!user?.id || loading || isStreaming || !hasMore) return;

    try {
      const nextPage = page + 1;
      const res = await api.get("/chat", {
        params: { userId: user.id, page: nextPage, limit: 20 },
      });

      const fetchedChats = res.data || [];
      if (fetchedChats.length < 20) {
        setHasMore(false);
      }
      
      appendChats(fetchedChats);
      setPage(nextPage);
    } catch (err) {
      console.error("Error fetching more chats", err);
    }
  };

  useEffect(() => {
    if (
      !user?.id ||
      loading ||
      isStreaming ||
      fetchedUserIdRef.current === user.id
    ) {
      return;
    }

    const fetchChats = async () => {
      try {
        const res = await api.get("/chat", {
          params: { userId: user.id, page: 1, limit: 20 },
        });

        const fetchedChats = res.data || [];
        fetchedUserIdRef.current = user.id;
        setChats(fetchedChats);
        setPage(1);
        setHasMore(fetchedChats.length === 20);

        if (fetchedChats.length === 0) {
          if (isNewChat || messages.length > 0) return;
          setCurrentChat(null);
          setMessages([]);
          return;
        }

        const shouldAutoSelectFirstChat =
          !currentChatId &&
          !isNewChat &&
          !loading &&
          !isStreaming &&
          messages.length === 0;

        if (shouldAutoSelectFirstChat) {
          setCurrentChat(fetchedChats[0]._id);
        }
      } catch (err) {
        console.error("Error fetching chats", err);
        // Only show error if server is not already confirmed down
        if (!isDown) {
          toast.error("Could not load chats.");
        }
      }
    };

    fetchChats();
  }, [
    user?.id,
    currentChatId,
    isNewChat,
    loading,
    isStreaming,
    messages.length,
    setChats,
    setCurrentChat,
    setMessages,
    setPage,
    setHasMore,
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
    selectChat,
    fetchMoreChats,
    hasMore,
  };
};
