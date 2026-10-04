import type { AppIssue } from '@simagents/shared';
import { create } from 'zustand';
export const useConnectionVerificationStore = create<{
  results: Record<string, { status: 'verified' | 'unavailable'; at: number; message?: string; issue?: AppIssue }>;
  record: (signature: string, status: 'verified' | 'unavailable', message?: string, issue?: AppIssue) => void;
}>((set, get) => ({
  results: {}, record: (signature, status, message, issue) => {
    const entries = Object.entries(get().results).slice(-99);
    set({ results: { ...Object.fromEntries(entries), [signature]: { status, at: Date.now(), message, issue } } });
  },
}));
