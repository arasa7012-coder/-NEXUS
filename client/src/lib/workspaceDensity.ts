export const WORKSPACE_PREFERENCES_KEY = "nexus.workspace-preferences.v1";

export const workspaceDensities = ["compact", "comfortable", "spacious"] as const;
export type WorkspaceDensity = (typeof workspaceDensities)[number];

export const defaultWorkspaceDensity: WorkspaceDensity = "comfortable";

export function isWorkspaceDensity(value: unknown): value is WorkspaceDensity {
  return typeof value === "string" && workspaceDensities.includes(value as WorkspaceDensity);
}

export function normalizeWorkspaceDensity(value: unknown): WorkspaceDensity {
  return isWorkspaceDensity(value) ? value : defaultWorkspaceDensity;
}
