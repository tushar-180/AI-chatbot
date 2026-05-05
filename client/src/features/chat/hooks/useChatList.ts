import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { useChatStore } from "@/features/chat/store/useChatStore";
import { api } from "@/lib/api";

export const useChatList = () => {
  const { user } = useUser();
  const {
    chats,
    currentChatId,
    messages,
    loading,
    isStreaming,
    isNewChat,
    setChats,
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
  };

  const deleteChat = async (chatId: string) => {
    try {
      await api.delete(`/chat/${chatId}`);
      removeChat(chatId);
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
  };

  useEffect(() => {
    if (!user?.id || loading || isStreaming) return;
    const fetchChats = async () => {
      console.log("fetch")
      try {
        const res = await api.get("/chat", {
          params: { userId: user.id },
        });

        const fetchedChats = res.data || [];
        setChats(fetchedChats);

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
        toast.error("Could not load chats.");
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
  ]);

  return {
    chats,
    currentChatId,
    createChat,
    deleteChat,
    renameChat,
    selectChat,
  };
};
