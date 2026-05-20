import { create } from "zustand";

export interface SelectionContext {
  selectedText: string;
  originalSourceMessage: string;
  sourceMessageId: string;
  actionType: string;
}

interface ComposerStore {
  selectionContext: SelectionContext | null;
  setSelectionContext: (context: SelectionContext | null) => void;
  clearSelectionContext: () => void;
}

export const useComposerStore = create<ComposerStore>((set) => ({
  selectionContext: null,
  setSelectionContext: (selectionContext) => set({ selectionContext }),
  clearSelectionContext: () => set({ selectionContext: null }),
}));
