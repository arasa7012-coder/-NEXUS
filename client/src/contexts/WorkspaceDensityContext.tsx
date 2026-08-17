import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultWorkspaceDensity, normalizeWorkspaceDensity, WORKSPACE_PREFERENCES_KEY, type WorkspaceDensity } from "@/lib/workspaceDensity";

type WorkspaceDensityContextValue = {
  density: WorkspaceDensity;
  setDensity: (density: WorkspaceDensity) => void;
};

const WorkspaceDensityContext = createContext<WorkspaceDensityContextValue | null>(null);

function readStoredDensity(): WorkspaceDensity {
  if (typeof window === "undefined") return defaultWorkspaceDensity;
  try {
    const saved = window.localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
    if (!saved) return defaultWorkspaceDensity;
    return normalizeWorkspaceDensity((JSON.parse(saved) as { density?: unknown }).density);
  } catch {
    return defaultWorkspaceDensity;
  }
}

export function WorkspaceDensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<WorkspaceDensity>(readStoredDensity);

  useEffect(() => {
    document.documentElement.dataset.nexusDensity = density;
  }, [density]);

  const setDensity = useCallback((nextDensity: WorkspaceDensity) => {
    setDensityState(nextDensity);
    if (typeof window === "undefined") return;
    try {
      const current = window.localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
      const parsed = current ? JSON.parse(current) as Record<string, unknown> : {};
      window.localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify({ ...parsed, density: nextDensity }));
    } catch {
      // The active session still receives the selected density if browser storage is unavailable.
    }
  }, []);

  return <WorkspaceDensityContext.Provider value={{ density, setDensity }}>{children}</WorkspaceDensityContext.Provider>;
}

export function useWorkspaceDensity() {
  const context = useContext(WorkspaceDensityContext);
  if (!context) throw new Error("useWorkspaceDensity must be used within WorkspaceDensityProvider");
  return context;
}
