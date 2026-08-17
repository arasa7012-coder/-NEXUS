import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiveDataRateLimitNotice } from "./LiveDataRateLimitNotice";

describe("LiveDataRateLimitNotice", () => {
  it("announces the bounded retry window and keeps manual retry unavailable", () => {
    const markup = renderToStaticMarkup(
      React.createElement(LiveDataRateLimitNotice, {
        retryAfterSeconds: 18,
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain("temporarily limited requests");
    expect(markup).toContain("18 seconds");
    expect(markup).toContain("Retry paused");
    expect(markup).toContain("disabled");
    expect(markup).toContain('role="status"');
  });
});
