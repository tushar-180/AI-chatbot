import { create } from "zustand";

export interface SelectionData {
  selectedText: string;
  originalSourceMessage: string;
  sourceMessageId: string;
  actionType: string;
  position: { top: number; left: number };
  isExceeded?: boolean;
}

interface SelectionStore {
  selection: SelectionData | null;
  setSelection: (selection: SelectionData | null) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selection: null,
  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: null }),
}));
