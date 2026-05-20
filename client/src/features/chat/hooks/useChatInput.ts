import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { DEFAULT_CHAT_PROVIDER } from "@/features/chat/constants/chat.constants";

export interface Attachment {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

import { useComposerStore } from "@/features/chat/store/useComposerStore";

interface UseChatInputProps {
  onSubmit: (
    input: string,
    provider: string,
    attachments?: Attachment[],
    options?: {
      webSearchEnabled?: boolean;
      forceNewChat?: boolean;
    },
  ) => Promise<void>;
  initialProvider?: string;
}

const STORAGE_KEY = "selected_chat_provider";

export const useChatInput = ({
  onSubmit,
  initialProvider,
}: UseChatInputProps) => {
  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return initialProvider || saved || DEFAULT_CHAT_PROVIDER;
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const { chatId } = useParams<{ chatId?: string }>();

  // Clear typed input, attachments, and reset web search when chat switching
  useEffect(() => {
    setInput("");
    setAttachments([]);
    setWebSearchEnabled(false);
  }, [chatId]);

  // Persist provider selection
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, selectedProvider);
  }, [selectedProvider]);

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const selectionContext = useComposerStore.getState().selectionContext;
    if (!input.trim() && attachments.length === 0 && !selectionContext) return;

    const currentInput = input;
    const currentAttachments = [...attachments];

    setInput("");
    setAttachments([]); // Clear both

    await onSubmit(currentInput, selectedProvider, currentAttachments, {
      webSearchEnabled,
    });
  };

  return {
    input,
    setInput,
    selectedProvider,
    setSelectedProvider,
    attachments,
    setAttachments,
    webSearchEnabled,
    setWebSearchEnabled,
    handleFormSubmit,
  };
};
