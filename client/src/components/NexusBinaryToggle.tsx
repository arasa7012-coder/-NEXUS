import * as React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export type NexusBinaryToggleOption<T extends string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
  tone?: "primary" | "success" | "danger";
};

type NexusBinaryToggleProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly [NexusBinaryToggleOption<T>, NexusBinaryToggleOption<T>];
  ariaLabel: string;
  disabled?: boolean;
  direction?: "ltr" | "rtl";
  className?: string;
};

type NavigationKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

export function getNextBinaryToggleValue<T extends string>(options: readonly [T, T], currentValue: T, key: NavigationKey, direction: "ltr" | "rtl"): T {
  const currentIndex = options.indexOf(currentValue);
  if (key === "Home") return options[0];
  if (key === "End") return options[1];
  const horizontalStep = key === "ArrowRight" ? 1 : -1;
  const logicalStep = direction === "rtl" ? -horizontalStep : horizontalStep;
  return options[(currentIndex + logicalStep + options.length) % options.length]!;
}

export function NexusBinaryToggle<T extends string>({ value, onValueChange, options, ariaLabel, disabled = false, direction: directionProp, className }: NexusBinaryToggleProps<T>) {
  const { direction: languageDirection } = useLanguage();
  const direction = directionProp ?? languageDirection;
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = options[0].value === value ? 0 : 1;
  const activeTone = options[activeIndex].tone ?? "primary";
  const markerTransform = activeIndex === 0 ? "translateX(0)" : direction === "rtl" ? "translateX(-100%)" : "translateX(100%)";
  const markerToneClass = activeTone === "success" ? "bg-success shadow-[0_8px_20px_rgba(16,185,129,0.22)]" : activeTone === "danger" ? "bg-danger shadow-[0_8px_20px_rgba(239,68,68,0.2)]" : "bg-primary shadow-[0_8px_20px_rgba(59,130,246,0.24)]";

  const selectOption = (nextValue: T, nextIndex: number) => {
    if (disabled) return;
    if (nextValue !== value) onValueChange(nextValue);
    buttonRefs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !(["ArrowLeft", "ArrowRight", "Home", "End"] as const).includes(event.key as NavigationKey)) return;
    event.preventDefault();
    const nextValue = getNextBinaryToggleValue(options.map((option) => option.value) as [T, T], value, event.key as NavigationKey, direction);
    selectOption(nextValue, options.findIndex((option) => option.value === nextValue));
  };

  return <div dir={direction} data-slot="nexus-binary-toggle" data-disabled={disabled ? "true" : "false"} role="group" aria-label={ariaLabel} className={cn("relative grid min-h-10 grid-cols-2 rounded-xl border border-border bg-background-secondary p-1 shadow-inner shadow-black/10", disabled && "cursor-not-allowed opacity-55", className)}>
    <span aria-hidden="true" className={cn("nexus-toggle-marker pointer-events-none absolute inset-y-1 z-0 w-[calc(50%-0.25rem)] rounded-lg", markerToneClass)} style={{ insetInlineStart: "0.25rem", transform: markerTransform }} />
    {options.map((option, index) => {
      const isActive = option.value === value;
      return <button key={option.value} ref={(element) => { buttonRefs.current[index] = element; }} type="button" disabled={disabled} aria-pressed={isActive} onClick={() => selectOption(option.value, index)} onKeyDown={handleKeyDown} className={cn("relative z-10 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold tracking-[0.01em] text-foreground-secondary outline-none transition-transform duration-150 active:scale-[0.97] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none", isActive && "text-primary-foreground")}>{option.icon ? <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">{option.icon}</span> : null}<span>{option.label}</span></button>;
    })}
  </div>;
}
