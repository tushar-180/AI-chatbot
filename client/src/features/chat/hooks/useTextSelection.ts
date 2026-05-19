import { useEffect, useRef } from "react";
import { useSelectionStore } from "../store/useSelectionStore";

export const useTextSelection = () => {
  const setSelection = useSelectionStore((state) => state.setSelection);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const activeSelectionRef = useRef<Selection | null>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      activeSelectionRef.current = selection;

      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        clearSelection();
        return;
      }

      let selectedText = selection.toString().trim();
      if (!selectedText) {
        clearSelection();
        return;
      }

      // Limit selection text to a maximum of 2000 characters
      if (selectedText.length > 2000) {
        selectedText = selectedText.slice(0, 2000) + "...";
      }

      // Check if selection is within an assistant message bubble
      let anchorNode = selection.anchorNode;
      if (!anchorNode) {
        clearSelection();
        return;
      }

      let currentElement: HTMLElement | null =
        anchorNode.nodeType === Node.TEXT_NODE
          ? (anchorNode.parentElement as HTMLElement)
          : (anchorNode as HTMLElement);

      let assistantBubble: HTMLElement | null = null;
      while (currentElement) {
        if (currentElement.getAttribute?.("data-message-role") === "assistant") {
          assistantBubble = currentElement;
          break;
        }
        currentElement = currentElement.parentElement;
      }

      if (!assistantBubble) {
        clearSelection();
        return;
      }

      const messageId = assistantBubble.getAttribute("data-message-id") || "";
      const originalContent = assistantBubble.getAttribute("data-message-content") || "";

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // If selection bounds are invalid/empty, clear selection
        if (rect.width === 0 && rect.height === 0) {
          clearSelection();
          return;
        }

        // Calculate absolute viewport positions (fixed coordinates)
        const top = rect.top - 48; // Position 48px above selected text
        const left = rect.left + rect.width / 2; // Center horizontally

        setSelection({
          selectedText,
          originalSourceMessage: originalContent,
          sourceMessageId: messageId,
          actionType: "ask_to_velora",
          position: { top, left },
        });
      } catch (err) {
        console.error("Error computing selection bounds:", err);
        clearSelection();
      }
    };

    // Listen to mouseup and touchend on document to show toolbar after selection is completed
    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("touchend", handleSelectionChange);

    // Dismiss toolbar on outside click/drag start
    const handleDocumentMouseDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. If clicking inside the floating toolbar itself, do NOT dismiss it
      const toolbarElement = document.getElementById("selection-toolbar");
      if (toolbarElement && toolbarElement.contains(target)) {
        return;
      }

      // 2. Instantly collapse browser selection range to clear it
      window.getSelection()?.removeAllRanges();

      // Otherwise, clear selection on new click start
      clearSelection();
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("touchstart", handleDocumentMouseDown);

    return () => {
      document.removeEventListener("mouseup", handleSelectionChange);
      document.removeEventListener("touchend", handleSelectionChange);
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("touchstart", handleDocumentMouseDown);
    };
  }, [setSelection, clearSelection]);
};
