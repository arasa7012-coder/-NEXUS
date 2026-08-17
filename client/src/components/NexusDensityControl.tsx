import React from "react";
import { AlignCenter, AlignJustify, AlignVerticalJustifyCenter } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWorkspaceDensity } from "@/contexts/WorkspaceDensityContext";
import { workspaceDensities, type WorkspaceDensity } from "@/lib/workspaceDensity";

const icons = { compact: AlignJustify, comfortable: AlignCenter, spacious: AlignVerticalJustifyCenter } as const;

export function NexusDensityControl({ className = "" }: { className?: string }) {
  const { density, setDensity } = useWorkspaceDensity();
  const { language } = useLanguage();
  const isArabic = language === "ar";
  const labels: Record<WorkspaceDensity, string> = isArabic
    ? { compact: "مدمج", comfortable: "مريح", spacious: "واسع" }
    : { compact: "Compact", comfortable: "Comfortable", spacious: "Spacious" };
  const groupLabel = isArabic ? "كثافة اللوحة" : "Workspace density";

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? workspaceDensities.length - 1 : direction ? (index + direction + workspaceDensities.length) % workspaceDensities.length : null;
    if (targetIndex === null) return;
    event.preventDefault();
    const next = workspaceDensities[targetIndex];
    setDensity(next);
    document.getElementById(`nexus-density-${next}`)?.focus();
  };

  return (
    <div className={`inline-flex rounded-xl border border-border bg-background-secondary p-1 ${className}`} role="radiogroup" aria-label={groupLabel}>
      {workspaceDensities.map((option, index) => {
        const Icon = icons[option];
        const active = density === option;
        return <button id={`nexus-density-${option}`} key={option} type="button" role="radio" aria-checked={active} onClick={() => setDensity(option)} onKeyDown={(event) => onKeyDown(event, index)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground-secondary hover:bg-card hover:text-foreground"}`}><Icon className="size-3.5" aria-hidden="true" /><span>{labels[option]}</span></button>;
      })}
    </div>
  );
}
