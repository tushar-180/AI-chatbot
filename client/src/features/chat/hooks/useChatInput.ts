import { useState } from "react";
import type { FormEvent } from "react";
import { DEFAULT_CHAT_PROVIDER } from "@/features/chat/constants/chat.constants";

interface UseChatInputProps {
  onSubmit: (input: string, provider: string) => Promise<void>;
  initialProvider?: string;
}

export const useChatInput = ({ onSubmit, initialProvider }: UseChatInputProps) => {
  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(
    initialProvider || DEFAULT_CHAT_PROVIDER,
  );

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const currentInput = input;
    setInput(""); // Clear input early for better UX
    await onSubmit(currentInput, selectedProvider);
  };

  return {
    input,
    setInput,
    selectedProvider,
    setSelectedProvider,
    handleFormSubmit,
  };
};
