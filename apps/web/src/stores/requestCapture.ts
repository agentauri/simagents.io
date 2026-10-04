import { create } from 'zustand';
/** Deliberately tab-local. Restoring a world never opts the user into capture. */
export const useRequestCaptureStore = create<{ enabled: boolean; setEnabled: (enabled: boolean) => void }>(set => ({
  enabled: false,
  setEnabled: enabled => set({ enabled }),
}));
