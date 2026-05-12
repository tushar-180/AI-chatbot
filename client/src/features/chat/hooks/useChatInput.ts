import { useState } from "react";
import type { FormEvent } from "react";
import { DEFAULT_CHAT_PROVIDER } from "@/features/chat/constants/chat.constants";

export interface Attachment {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

interface UseChatInputProps {
  onSubmit: (
    input: string,
    provider: string,
    attachments?: Attachment[],
    options?: {
      webSearchEnabled?: boolean;
    },
  ) => Promise<void>;
  initialProvider?: string;
}

export const useChatInput = ({
  onSubmit,
  initialProvider,
}: UseChatInputProps) => {
  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(
    initialProvider || DEFAULT_CHAT_PROVIDER,
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;

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
