import { useEffect, useRef } from "react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { useChatStore } from "@/features/chat/store/chat.store";
import { useMessageStore } from "@/features/chat/store/message.store";
import { useUiStore } from "@/features/chat/store/ui.store";
import { api } from "@/lib/api";

export const useChatList = () => {
  const { user } = useUser();
  const fetchedUserIdRef = useRef<string | null>(null);
  
  const chats = useChatStore((state) => state.chats);
  const currentChatId = useChatStore((state) => state.currentChatId);
  const isNewChat = useChatStore((state) => state.isNewChat);
  const setChats = useChatStore((state) => state.setChats);
  const setCurrentChat = useChatStore((state) => state.setCurrentChat);
  const setIsNewChat = useChatStore((state) => state.setIsNewChat);
  const removeChat = useChatStore((state) => state.removeChat);
  const updateChatTitle = useChatStore((state) => state.updateChatTitle);

  const removeChatMessages = useMessageStore((state) => state.removeChatMessages);
  
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  const createChat = () => {
    setIsNewChat(true);
    setCurrentChat(null);
    setSidebarOpen(false);
  };

  const deleteChat = async (chatId: string) => {
    try {
      await api.delete(`/chat/${chatId}`);
      removeChat(chatId);
      removeChatMessages(chatId);
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
      throw err;
    }
  };

  const selectChat = (chatId: string) => {
    if (chatId === currentChatId) {
      setSidebarOpen(false);
      return;
    }

    setIsNewChat(false);
    setCurrentChat(chatId);
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!user?.id || fetchedUserIdRef.current === user.id) {
      return;
    }

    const fetchChats = async () => {
      try {
        const res = await api.get("/chat", {
          params: { userId: user.id },
        });

        const fetchedChats = res.data || [];
        fetchedUserIdRef.current = user.id;
        setChats(fetchedChats);

        if (fetchedChats.length === 0) {
          if (isNewChat) return;
          setCurrentChat(null);
          return;
        }

        // Only auto select if current chat is null and it's not a requested new chat
        const shouldAutoSelectFirstChat = !currentChatId && !isNewChat;

        if (shouldAutoSelectFirstChat) {
          setCurrentChat(fetchedChats[0]._id);
        }
      } catch (err) {
        console.error("Error fetching chats", err);
        toast.error("Could not load chats.");
      }
    };

    fetchChats();
  }, [user?.id, currentChatId, isNewChat, setChats, setCurrentChat]);

  return {
    chats,
    currentChatId,
    createChat,
    deleteChat,
    renameChat,
    selectChat,
  };
};
