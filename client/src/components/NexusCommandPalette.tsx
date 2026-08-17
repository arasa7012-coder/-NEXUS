import * as React from "react";
import { useLocation } from "wouter";
import { Activity, BarChart3, BellRing, BrainCircuit, CandlestickChart, ClipboardCheck, LayoutDashboard, Radar, Settings, ShieldAlert, ShieldCheck, Search, TimerReset, WalletCards } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import type { TranslationKey } from "@/i18n/messages";

type CommandEntry = { path: string; key: TranslationKey; icon: typeof Search; shortcut?: string };

const entries: CommandEntry[] = [
  { path: "/", key: "overview", icon: LayoutDashboard, shortcut: "G D" },
  { path: "/nexus-command", key: "command", icon: ShieldAlert, shortcut: "G N" },
  { path: "/markets", key: "markets", icon: BarChart3, shortcut: "G M" },
  { path: "/watchlist-premium", key: "watchlist", icon: Radar },
  { path: "/trading", key: "trading", icon: CandlestickChart },
  { path: "/chart", key: "chart", icon: CandlestickChart, shortcut: "G C" },
  { path: "/scanner", key: "riskSignals", icon: Radar },
  { path: "/risk-settings", key: "riskCenter", icon: ShieldCheck },
  { path: "/portfolio-premium", key: "positions", icon: WalletCards },
  { path: "/alerts", key: "alerts", icon: BellRing },
  { path: "/monitor", key: "liveMonitoring", icon: TimerReset },
  { path: "/nexus-command#monitoring", key: "monitoringHealth", icon: Activity },
  { path: "/audit-log", key: "events", icon: ClipboardCheck },
  { path: "/nexus-command#evidence", key: "evidence", icon: ShieldAlert },
  { path: "/nexus-command#approvals", key: "approvals", icon: ClipboardCheck },
  { path: "/nexus-command#actions", key: "actions", icon: ShieldCheck },
  { path: "/nexus-command#activity", key: "activity", icon: Activity },
  { path: "/copilot", key: "copilot", icon: BrainCircuit },
  { path: "/security", key: "security", icon: ShieldCheck },
  { path: "/strategy-lab", key: "strategyLab", icon: BrainCircuit, shortcut: "G S" },
  { path: "/strategy-research", key: "research", icon: BrainCircuit },
  { path: "/csv-source-trust", key: "sourceTrust", icon: ClipboardCheck },
  { path: "/settings", key: "settings", icon: Settings },
];

const assets = [
  { id: "bitcoin", label: "Bitcoin · BTC" },
  { id: "ethereum", label: "Ethereum · ETH" },
  { id: "solana", label: "Solana · SOL" },
  { id: "binancecoin", label: "BNB · BNB" },
  { id: "ripple", label: "XRP · XRP" },
  { id: "cardano", label: "Cardano · ADA" },
  { id: "dogecoin", label: "Dogecoin · DOGE" },
  { id: "chainlink", label: "Chainlink · LINK" },
  { id: "xau-usd", label: "Gold · XAU/USD · XAU" },
] as const;

export function NexusCommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const go = (path: string) => {
    const [route, hash] = path.split("#");
    setLocation(route);
    onOpenChange(false);
    if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return <CommandDialog open={open} onOpenChange={onOpenChange} title={t("globalSearch")} description={t("quickActionsDescription")} className="border-border bg-card text-foreground sm:max-w-xl">
    <CommandInput placeholder={t("searchNexus")} />
    <CommandList>
      <CommandEmpty>{t("noMatchingActions")}</CommandEmpty>
      <CommandGroup heading={t("quickActions")}>
        {entries.map((entry) => { const Icon = entry.icon; return <CommandItem key={entry.path} value={`${t(entry.key)} ${entry.path}`} onSelect={() => go(entry.path)}><Icon /><span>{t(entry.key)}</span>{entry.shortcut ? <CommandShortcut>{entry.shortcut}</CommandShortcut> : null}</CommandItem>; })}
      </CommandGroup>
      <CommandGroup heading={t("quickAssets")}>
        {assets.map((asset) => <CommandItem key={asset.id} value={asset.label} onSelect={() => go(`/assets/${asset.id}`)}><Search /><span dir="ltr">{asset.label}</span></CommandItem>)}
      </CommandGroup>
    </CommandList>
  </CommandDialog>;
}
