import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ monitoring: { notificationReadiness: { invalidate: vi.fn() } } }), monitoring: { notificationReadiness: { useQuery: () => ({}) }, updateNotificationPreferences: { useMutation: () => ({ mutate: vi.fn() }) }, registerDeviceReadiness: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, revokeDevice: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } } }));

import Notifications from "./Notifications";

describe("Notifications consent boundary", () => {
  it("does not present preview messages or delivery success before the user is authenticated", () => {
    const html = renderToStaticMarkup(createElement(Notifications));
    expect(html).toContain("Sign in to manage notification consent.");
    expect(html).toContain("No external delivery is active");
    expect(html).not.toContain("Reference message");
  });
});
