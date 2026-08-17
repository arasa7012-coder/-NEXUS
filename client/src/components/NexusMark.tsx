import * as React from "react";
import { cn } from "@/lib/utils";

export function NexusMark({ className, title = "Nexus" }: { className?: string; title?: string }) {
  const gradientId = React.useId();
  const glowId = React.useId();
  return <svg viewBox="0 0 48 48" role="img" aria-label={title} className={cn("shrink-0", className)}>
    <defs>
      <linearGradient id={gradientId} x1="8" x2="40" y1="6" y2="42" gradientUnits="userSpaceOnUse">
        <stop stopColor="currentColor" stopOpacity="0.98" />
        <stop offset="0.52" stopColor="currentColor" stopOpacity="0.78" />
        <stop offset="1" stopColor="currentColor" stopOpacity="0.38" />
      </linearGradient>
      <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.15" /></filter>
    </defs>
    <path d="M24 4.8 40.2 14v20L24 43.2 7.8 34V14z" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M14 30.2V17.8l20 12.4V17.8" fill="none" stroke={`url(#${gradientId})`} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.25" />
    <path d="M14 17.8 24 11.7l10 6.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.34" strokeWidth="1.55" />
    <circle cx="14" cy="17.8" r="2.05" fill="currentColor" filter={`url(#${glowId})`} opacity="0.68" />
    <circle cx="34" cy="30.2" r="2.05" fill="currentColor" filter={`url(#${glowId})`} opacity="0.68" />
    <circle cx="14" cy="17.8" r="1.35" fill="currentColor" />
    <circle cx="34" cy="30.2" r="1.35" fill="currentColor" />
  </svg>;
}
