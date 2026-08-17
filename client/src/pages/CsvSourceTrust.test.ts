import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { privateError } = vi.hoisted(() => ({ privateError: { current: null as Error | null } }));
vi.mock("@/lib/trpc", () => ({ trpc: (() => ({ useUtils: () => ({ strategyLab: { listTrustedPublisherKeys: { invalidate: vi.fn() } } }), strategyLab: { listTrustedPublisherKeys: { useQuery: () => ({ data: [], isLoading: false, error: privateError.current }) }, previewCsvAuthentication: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, importCsvDataset: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, registerTrustedPublisherKey: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, revokeTrustedPublisherKey: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } }))() }));
import CsvSourceTrust from "./CsvSourceTrust";

describe("CSV source-trust rendered states", () => {
  it("states the authentication boundary and does not fabricate a trusted publisher key", () => { privateError.current = null; const html = renderToStaticMarkup(createElement(CsvSourceTrust)); expect(html).toContain("Authenticate the exact CSV you test"); expect(html).toContain("No trusted publisher key is registered"); expect(html).toContain("Never paste a private key"); expect(html).toContain("does not make the source platform-verified"); });
  it("distinguishes unavailable private keys from an empty account", () => { privateError.current = new Error("not authenticated"); const html = renderToStaticMarkup(createElement(CsvSourceTrust)); expect(html).toContain("Private source-trust records are unavailable"); expect(html).not.toContain("No trusted publisher key is registered"); });
});
