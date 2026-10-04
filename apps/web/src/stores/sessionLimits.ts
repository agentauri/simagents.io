import { create } from 'zustand';
import { DEFAULT_SESSION_LIMITS, validateSessionLimits, type SessionLimits } from '@simagents/engine/engine/llm/request-budget';
const STORAGE_KEY = 'simagents_session_limits_v1';
function load(): SessionLimits {
  try { return validateSessionLimits(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')); }
  catch { return { ...DEFAULT_SESSION_LIMITS }; }
}
export interface SessionUsage { requests: number; elapsedMs: number; limits: SessionLimits }
export const useSessionLimitsStore = create<{
  limits: SessionLimits; usage?: SessionUsage; setLimits: (limits: SessionLimits) => void; setUsage: (usage?: SessionUsage) => void;
}>((set) => ({
  limits: load(),
  setLimits: (limits) => {
    const checked = validateSessionLimits(limits);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(checked)); } catch { /* Limits still apply to this tab. */ }
    set({ limits: checked });
  },
  setUsage: (usage) => set({ usage }),
}));
