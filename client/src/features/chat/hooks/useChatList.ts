import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { useChatStore, TEMP_CHAT_ID } from "@/features/chat/store/useChatStore";
import { api } from "@/lib/api";

export const useChatList = () => {
    const { user } = useUser();

    const {
        chats,
        currentChatId,
        loading,
        isStreaming,
        isNewChat,
        setChats,
        setCurrentChat,
        setIsNewChat,
        setSidebarOpen,
        removeChat,
        updateChatTitle,
    } = useChatStore();

    const createChat = () => {
        setIsNewChat(true);
        setCurrentChat(null);
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
        if (!user?.id || loading || isStreaming) return;

        const fetchChats = async () => {
            try {
                const res = await api.get("/chat", {
                    params: { userId: user.id },
                });

                const fetchedChats = res.data || [];
                setChats(fetchedChats);

                // ===== no chats =====
                if (fetchedChats.length === 0) {
                    if (isNewChat) return;
                    setCurrentChat(null);
                    return;
                }

                // ===== prevent auto-select during temp chat =====
                if (currentChatId === TEMP_CHAT_ID) return;

                const shouldAutoSelectFirstChat =
                    !currentChatId && !isNewChat && !loading && !isStreaming;

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
        setChats,
        setCurrentChat,
        // ❌ removed messagesByChatId dependency
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
