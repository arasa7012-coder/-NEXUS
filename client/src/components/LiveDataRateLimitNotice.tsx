import React from "react";
import { TimerReset } from "lucide-react";

export function LiveDataRateLimitNotice({ retryAfterSeconds, onRetry }: { retryAfterSeconds: number; onRetry: () => void }) {
  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite">
      <div className="flex gap-2">
        <TimerReset className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>The public market provider has temporarily limited requests. Automatic refresh is paused; a controlled retry will be available in about {retryAfterSeconds} second{retryAfterSeconds === 1 ? "" : "s"}.</span>
      </div>
      <button type="button" disabled onClick={onRetry} className="self-start rounded-lg border border-warning/35 px-3 py-1.5 text-xs font-semibold text-warning opacity-60 disabled:cursor-not-allowed sm:self-auto" aria-label={`Live-data retry available in about ${retryAfterSeconds} seconds`}>
        Retry paused
      </button>
    </aside>
  );
}
