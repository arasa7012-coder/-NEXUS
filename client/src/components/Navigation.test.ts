import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ useLocation: () => ["/chart", vi.fn()] }));
vi.mock("framer-motion", () => ({ AnimatePresence: ({ children }: { children: unknown }) => createElement(Fragment, null, children), motion: { div: "div", button: "button" } }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock("@/hooks/useMarketIntelligence", () => ({ useMarketIntelligenceOverview: () => ({ isLoading: false, data: { success: true, data: { majorMovements: [{ assetId: "bitcoin", symbol: "BTC", priceUsd: 100000, priceChange24hPercent: 2.25 }] } } }) }));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "dark", switchable: true, toggleTheme: vi.fn() }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "ar", direction: "rtl", toggleLanguage: vi.fn(), t: (key: string) => ({ nexus: "نيكسس", overview: "نظرة عامة", command: "قيادة Nexus", markets: "الأسواق", trading: "التداول", intelligence: "الذكاء", workspace: "مساحة العمل", watchlist: "قائمة المراقبة", riskCenter: "مركز المخاطر", positions: "المراكز", riskSignals: "إشارات المخاطر", alerts: "التنبيهات", liveMonitoring: "المراقبة الحية", monitoringHealth: "صحة المراقبة", events: "الأحداث", evidence: "الأدلة", approvals: "الموافقات", actions: "الإجراءات", activity: "النشاط", copilot: "مساعد Nexus", security: "الأمان", settings: "الإعدادات", switchLanguage: "تبديل اللغة", languageEnglish: "الإنجليزية", languageArabic: "العربية", theme: "تبديل المظهر", signIn: "تسجيل الدخول", signOut: "تسجيل الخروج", commandCenter: "مركز القيادة", quickActions: "إجراءات سريعة", quickActionsDescription: "انتقل إلى مساحة عمل Nexus متحققة.", globalSearch: "البحث العام", searchNexus: "ابحث في Nexus", noMatchingActions: "لا توجد إجراءات مطابقة.", toggleNavigation: "تبديل التنقل", mobileNavigation: "تنقل الهاتف", moreNavigation: "تنقل إضافي", commandGroup: "القيادة", riskGroup: "المخاطر", monitoringGroup: "المراقبة", actionsGroup: "الإجراءات", systemGroup: "النظام" }[key] ?? key) }) }));

import Navigation from "./Navigation";

describe("Nexus navigation organization", () => {
  it("renders the five logical Nexus groups and concrete primary destinations in Arabic RTL", () => {
    const html = renderToStaticMarkup(createElement(Navigation, null, createElement("main", null, "workspace")));
    ["القيادة", "المخاطر", "المراقبة", "الإجراءات", "النظام"].forEach((label) => expect(html).toContain(label));
    ["مركز المخاطر", "المراكز", "المراقبة الحية", "الموافقات", "مساعد Nexus"].forEach((label) => expect(html).toContain(label));
    expect(html).toContain("ابحث في Nexus");
    expect(html).toContain("تنقل إضافي");
    expect(html).toContain("التداول");
    expect(html).toContain("BTC");
    expect(html).toContain("+2.25%");
    expect(html).toContain('data-side="right"');
  });
});
