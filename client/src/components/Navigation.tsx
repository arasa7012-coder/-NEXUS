import * as React from "react";
import { useLocation } from "wouter";
import { Activity, Bell, BellRing, BrainCircuit, ChartNoAxesCombined, ChevronLeft, CircleUserRound, ClipboardCheck, CreditCard, Globe2, LayoutDashboard, Menu, Moon, Radar, Search, Settings, ShieldAlert, ShieldCheck, Sun, TimerReset, WalletCards } from "lucide-react";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useMarketIntelligenceOverview } from "@/hooks/useMarketIntelligence";
import { NexusMark } from "@/components/NexusMark";
import { NexusCommandPalette } from "@/components/NexusCommandPalette";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarSeparator, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import type { TranslationKey } from "@/i18n/messages";

type NavKey = Extract<TranslationKey, "command" | "markets" | "trading" | "intelligence" | "copilot" | "alerts" | "monitor" | "scanner" | "portfolio" | "risk" | "audit" | "security" | "settings" | "pricing" | "billing" | "overview" | "watchlist" | "smartMoney" | "riskCenter" | "positions" | "riskSignals" | "incidents" | "liveMonitoring" | "monitoringHealth" | "events" | "evidence" | "approvals" | "actions" | "activity">;
type NavEntry = { key: NavKey; path: string; icon: typeof LayoutDashboard };
type NavGroup = { title: Extract<TranslationKey, "commandGroup" | "riskGroup" | "monitoringGroup" | "actionsGroup" | "systemGroup">; entries: NavEntry[] };

const groups: NavGroup[] = [
  { title: "commandGroup", entries: [{ key: "overview", path: "/", icon: LayoutDashboard }, { key: "markets", path: "/markets", icon: ChartNoAxesCombined }, { key: "watchlist", path: "/watchlist-premium", icon: Radar }, { key: "smartMoney", path: "/smart-money", icon: Radar }, { key: "command", path: "/nexus-command", icon: ShieldAlert }] },
  { title: "riskGroup", entries: [{ key: "riskCenter", path: "/risk-settings", icon: ShieldCheck }, { key: "positions", path: "/portfolio-premium", icon: WalletCards }, { key: "riskSignals", path: "/scanner", icon: Radar }, { key: "alerts", path: "/alerts", icon: BellRing }] },
  { title: "monitoringGroup", entries: [{ key: "liveMonitoring", path: "/monitor", icon: TimerReset }, { key: "monitoringHealth", path: "/nexus-command#monitoring", icon: Activity }, { key: "events", path: "/audit-log", icon: ClipboardCheck }, { key: "evidence", path: "/nexus-command#evidence", icon: ShieldAlert }] },
  { title: "actionsGroup", entries: [{ key: "approvals", path: "/nexus-command#approvals", icon: ClipboardCheck }, { key: "actions", path: "/nexus-command#actions", icon: ShieldCheck }, { key: "activity", path: "/nexus-command#activity", icon: Activity }] },
  { title: "systemGroup", entries: [{ key: "copilot", path: "/copilot", icon: BrainCircuit }, { key: "billing", path: "/billing", icon: CreditCard }, { key: "pricing", path: "/pricing", icon: WalletCards }, { key: "security", path: "/security", icon: ShieldCheck }, { key: "settings", path: "/settings", icon: Settings }] },
];

const mobilePrimary: NavEntry[] = [
  { key: "overview", path: "/", icon: LayoutDashboard },
  { key: "markets", path: "/markets", icon: ChartNoAxesCombined },
  { key: "trading", path: "/trading", icon: Activity },
  { key: "riskCenter", path: "/risk-settings", icon: ShieldCheck },
];
const topLinks: NavEntry[] = [
  { key: "markets", path: "/markets", icon: ChartNoAxesCombined },
  { key: "trading", path: "/trading", icon: Activity },
  { key: "intelligence", path: "/scanner", icon: Radar },
  { key: "riskCenter", path: "/risk-settings", icon: ShieldCheck },
  { key: "liveMonitoring", path: "/monitor", icon: TimerReset },
];

export default function Navigation({ children }: { children: React.ReactNode }) {
  return <SidebarProvider defaultOpen style={{ "--sidebar-width": "var(--nx-sidebar-width)" } as React.CSSProperties}><NexusNavigationContent>{children}</NexusNavigationContent></SidebarProvider>;
}

function NexusNavigationContent({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const { user, logout } = useAuth();
  const { language, direction, t, toggleLanguage } = useLanguage();
  const { theme, switchable, toggleTheme } = useTheme();
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const tickerQuery = useMarketIntelligenceOverview();
  const tickerRows = tickerQuery.data?.success ? tickerQuery.data.data.majorMovements.slice(0, 6) : [];
  const side = direction === "rtl" ? "right" : "left";
  const navigate = React.useCallback((path: string) => {
    const [route, hash] = path.split("#");
    setLocation(route);
    setOpenMobile(false);
    if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [setLocation, setOpenMobile]);
  const languageLabel = language === "ar" ? t("languageEnglish") : t("languageArabic");

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen((open) => !open); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const iconButton = "nx-icon-button text-foreground-secondary transition-colors hover:border-primary/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45";
  return <>
    <Sidebar side={side} variant="floating" collapsible="icon" className="border-sidebar-border bg-sidebar p-1.5">
      <SidebarHeader className="p-1">
        <div className="flex items-center justify-between gap-2 px-2 py-2 group-data-[collapsible=icon]:px-1">
          <button type="button" onClick={() => navigate("/")} className="flex min-w-0 items-center gap-2 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-primary/45">
            <span className="grid size-8 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary"><NexusMark className="size-6" title={t("nexus")} /></span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block text-sm font-bold tracking-[0.08em] text-foreground">NEXUS</span><span className="block text-[9px] font-semibold uppercase tracking-[0.15em] text-foreground-muted">BLACK LABEL</span></span>
          </button>
          <SidebarTrigger className="size-7 text-foreground-secondary group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="py-1">
        {groups.map((group) => <SidebarGroup key={group.title} className="px-1.5 py-1"><SidebarGroupLabel className="px-2 text-[9px] uppercase tracking-[.14em] text-foreground-muted">{t(group.title)}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{group.entries.map((entry) => { const Icon = entry.icon; const route = entry.path.split("#")[0]; const active = location === entry.path || location === route || (route !== "/" && location.startsWith(`${route}/`)); return <SidebarMenuItem key={entry.path}><SidebarMenuButton isActive={active} tooltip={t(entry.key)} onClick={() => navigate(entry.path)} className="h-8 rounded-md px-2 text-xs"><Icon className="size-3.5" /><span>{t(entry.key)}</span></SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu></SidebarGroupContent></SidebarGroup>) }
      </SidebarContent>
      <SidebarFooter className="p-1.5"><SidebarSeparator /><SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip={user ? t("signOut") : t("signIn")} onClick={() => user ? logout() : startLogin()} className="h-8 rounded-md px-2 text-xs"><CircleUserRound className="size-3.5" /><span>{user ? t("signOut") : t("signIn")}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
    </Sidebar>

    <div className="nexus-shell nexus-surface min-w-0 flex flex-1 flex-col">
      <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/96">
        <MarketTicker rows={tickerRows} loading={tickerQuery.isLoading} />
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2"><Button type="button" variant="ghost" size="icon" onClick={toggleSidebar} aria-label={t("toggleNavigation")} title={t("toggleNavigation")} className="nx-icon-button size-8"><Menu className="size-4" /></Button><span className="hidden truncate text-[10px] font-semibold uppercase tracking-[.1em] text-foreground-secondary lg:block">{routeTitle(location, t)}</span></div>
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label={t("workspace")}>{topLinks.map((entry) => <button key={entry.path} type="button" onClick={() => navigate(entry.path)} className={`nx-button px-2.5 py-1.5 text-xs font-semibold ${location === entry.path ? "bg-primary/15 text-primary" : "text-foreground-secondary hover:bg-background-secondary hover:text-foreground"}`}>{t(entry.key)}</button>)}</nav>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1 xl:flex-none"><button type="button" onClick={() => setCommandOpen(true)} className="hidden min-w-0 max-w-xs flex-1 items-center justify-between gap-3 rounded-md border border-border bg-card px-2.5 py-1.5 text-start text-xs text-foreground-secondary transition-colors hover:border-primary/35 hover:text-foreground sm:flex xl:w-56"><span className="inline-flex min-w-0 items-center gap-2"><Search className="size-3.5 shrink-0 text-primary" /><span className="truncate">{t("searchNexus")}</span></span><kbd className="rounded border border-border bg-background px-1 py-0.5 text-[9px] font-semibold text-foreground-muted">⌘K</kbd></button><button type="button" aria-label={`${t("switchLanguage")}: ${languageLabel}`} title={t("switchLanguage")} onClick={toggleLanguage} className={iconButton}><Globe2 className="size-3.5" /></button>{switchable ? <button type="button" aria-label={t("theme")} title={t("theme")} onClick={toggleTheme} className={iconButton}>{theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}</button> : null}<button type="button" aria-label={t("alerts")} title={t("alerts")} onClick={() => navigate("/alerts")} className={iconButton}><Bell className="size-3.5" /></button><button type="button" aria-label={t("security")} title={t("security")} onClick={() => navigate("/security")} className={iconButton}><ShieldCheck className="size-3.5" /></button><button type="button" onClick={() => user ? logout() : startLogin()} className="hidden nx-button bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 sm:inline-flex">{user ? t("signOut") : t("signIn")}</button></div>
        </div>
      </header>
      <div className="min-w-0 flex-1 pb-20 md:pb-0">{children}</div>
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-lg border border-border bg-card/98 p-1 shadow-[0_16px_34px_rgba(0,0,0,.35)] md:hidden" aria-label={t("mobileNavigation")}>{mobilePrimary.map((entry) => { const Icon = entry.icon; const active = location === entry.path; return <button type="button" key={entry.path} onClick={() => navigate(entry.path)} aria-current={active ? "page" : undefined} className={`grid min-h-11 place-items-center rounded-md text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${active ? "bg-primary text-primary-foreground" : "text-foreground-secondary"}`}><Icon className="size-4" aria-hidden="true" /><span className="sr-only">{t(entry.key)}</span></button>; })}<button type="button" onClick={toggleSidebar} aria-label={t("moreNavigation")} className="grid min-h-11 place-items-center rounded-md text-foreground-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"><ChevronLeft className={`size-4 ${direction === "rtl" ? "rotate-180" : ""}`} aria-hidden="true" /><span className="sr-only">{t("moreNavigation")}</span></button></nav>
    </div>
    <NexusCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
  </>;
}

function MarketTicker({ rows, loading }: { rows: Array<{ assetId: string; symbol: string; priceUsd: number; priceChange24hPercent: number | null }>; loading: boolean }) {
  return <div className="nx-ticker flex items-center overflow-hidden" aria-live="polite"><span className="shrink-0 border-e border-border px-3 text-[9px] font-bold uppercase tracking-[.14em] text-primary">Market</span>{rows.length ? <div className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">{rows.map((row) => <span className="nx-ticker-item" key={row.assetId}><strong className="text-foreground">{row.symbol}</strong><span className="nx-number text-foreground-secondary">{formatTickerPrice(row.priceUsd)}</span><span className={`nx-number ${row.priceChange24hPercent === null ? "text-foreground-muted" : row.priceChange24hPercent >= 0 ? "text-success" : "text-danger"}`}>{row.priceChange24hPercent === null ? "—" : `${row.priceChange24hPercent >= 0 ? "+" : ""}${row.priceChange24hPercent.toFixed(2)}%`}</span></span>)}</div> : <span className="px-3 text-[10px] text-foreground-muted">{loading ? "Loading verified market ticker" : "Market data unavailable"}</span>}</div>;
}

function formatTickerPrice(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 1 ? 2 : 6 }).format(value); }

function routeTitle(path: string, t: (key: NavKey | "nexus") => string) {
  const currentRoute = path.split("#")[0];
  const entry = groups.flatMap((group) => group.entries).find((item) => item.path.split("#")[0] === currentRoute) ?? topLinks.find((item) => item.path === currentRoute) ?? (currentRoute === "/" ? groups[0].entries[0] : null);
  return entry ? t(entry.key) : t("nexus");
}
