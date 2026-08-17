import { AlertTriangle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";

type FormState = {
  riskPerTradePercent: string;
  maxDailyLossPercent: string;
  maxDailyDrawdownPercent: string;
  maxOpenPositions: string;
  maxPortfolioExposurePercent: string;
  maxAssetExposurePercent: string;
  stopMethod: "fixed" | "atr" | "structure";
  fixedStopPercent: string;
  atrMultiplier: string;
  structureBufferBps: string;
  minimumRewardRisk: string;
  consecutiveLossLimit: string;
  cooldownMinutes: string;
  feeBps: string;
  slippageBps: string;
  blockHighVolatility: boolean;
};

const numericKeys = ["riskPerTradePercent", "maxDailyLossPercent", "maxDailyDrawdownPercent", "maxOpenPositions", "maxPortfolioExposurePercent", "maxAssetExposurePercent", "fixedStopPercent", "atrMultiplier", "structureBufferBps", "minimumRewardRisk", "consecutiveLossLimit", "cooldownMinutes", "feeBps", "slippageBps"] as const;
const riskFieldLabels: Array<[typeof numericKeys[number], string, string]> = [["riskPerTradePercent", "Risk per trade (%)", "المخاطرة لكل صفقة (%)"], ["maxDailyLossPercent", "Maximum daily realized loss (%)", "الحد الأقصى للخسارة اليومية المحققة (%)"], ["maxDailyDrawdownPercent", "Maximum daily drawdown (%)", "الحد الأقصى للتراجع اليومي (%)"], ["maxOpenPositions", "Maximum open positions", "الحد الأقصى للمراكز المفتوحة"], ["maxPortfolioExposurePercent", "Maximum portfolio exposure (%)", "الحد الأقصى لتعرض المحفظة (%)"], ["maxAssetExposurePercent", "Maximum asset exposure (%)", "الحد الأقصى لتعرض الأصل (%)"], ["fixedStopPercent", "Fixed stop distance (%)", "مسافة وقف الخسارة الثابتة (%)"], ["atrMultiplier", "ATR stop multiplier", "مضاعف وقف ATR"], ["structureBufferBps", "Structure stop buffer (bps)", "هامش وقف البنية (bps)"], ["minimumRewardRisk", "Minimum reward / risk", "الحد الأدنى للعائد / المخاطرة"], ["consecutiveLossLimit", "Consecutive-loss limit", "حد الخسائر المتتالية"], ["cooldownMinutes", "Cooldown (minutes)", "فترة التهدئة (دقائق)"], ["feeBps", "Estimated fee (bps)", "الرسوم المقدرة (bps)"], ["slippageBps", "Estimated slippage (bps)", "الانزلاق السعري المقدر (bps)"]];

function fromSettings(settings: { [K in keyof FormState]?: unknown }): FormState {
  return {
    riskPerTradePercent: String(settings.riskPerTradePercent ?? ""), maxDailyLossPercent: String(settings.maxDailyLossPercent ?? ""), maxDailyDrawdownPercent: String(settings.maxDailyDrawdownPercent ?? ""), maxOpenPositions: String(settings.maxOpenPositions ?? ""), maxPortfolioExposurePercent: String(settings.maxPortfolioExposurePercent ?? ""), maxAssetExposurePercent: String(settings.maxAssetExposurePercent ?? ""), stopMethod: (settings.stopMethod as FormState["stopMethod"]) ?? "atr", fixedStopPercent: String(settings.fixedStopPercent ?? ""), atrMultiplier: String(settings.atrMultiplier ?? ""), structureBufferBps: String(settings.structureBufferBps ?? ""), minimumRewardRisk: String(settings.minimumRewardRisk ?? ""), consecutiveLossLimit: String(settings.consecutiveLossLimit ?? ""), cooldownMinutes: String(settings.cooldownMinutes ?? ""), feeBps: String(settings.feeBps ?? ""), slippageBps: String(settings.slippageBps ?? ""), blockHighVolatility: Boolean(settings.blockHighVolatility),
  };
}

export default function RiskSettings() {
  const { language } = useLanguage();
  const tr = (en: string, ar: string) => language === "ar" ? ar : en;
  const settingsQuery = trpc.risk.getRiskSettings.useQuery();
  const [form, setForm] = useState<FormState | null>(null);
  const utils = trpc.useUtils();
  useEffect(() => { if (settingsQuery.data) setForm(fromSettings(settingsQuery.data)); }, [settingsQuery.data]);
  const save = trpc.risk.updateRiskSettings.useMutation({
    onSuccess: (settings) => { setForm(fromSettings(settings)); void utils.risk.getRiskSettings.invalidate(); toast.success(tr("Paper-trading protection settings saved", "تم حفظ إعدادات حماية التداول الورقي")); },
    onError: (error) => toast.error(tr("Settings were not saved", "لم يتم حفظ الإعدادات"), { description: error.message }),
  });
  if (!form) return <main className="nexus-surface min-h-screen px-4 py-10 text-foreground sm:px-6"><div className="container nx-panel p-6 text-sm text-foreground-secondary" aria-busy="true">{tr("Loading paper-trading protection settings…", "جارٍ تحميل إعدادات حماية التداول الورقي…")}</div></main>;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => current ? { ...current, [key]: value } : current);
  const submit = () => {
    const payload = Object.fromEntries(numericKeys.map((key) => [key, Number(form[key]) as number]));
    if (Object.values(payload).some((value) => !Number.isFinite(value))) { toast.error(tr("Enter finite values for every numeric boundary.", "أدخل قيمًا منتهية لكل حد رقمي.")); return; }
    save.mutate({ ...payload, stopMethod: form.stopMethod, blockHighVolatility: form.blockHighVolatility });
  };
  return <main className="nexus-surface min-h-screen text-foreground"><header className="border-b border-border bg-background/96"><div className="container flex flex-col gap-4 py-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="nexus-eyebrow">{tr("Simulation safety controls", "ضوابط سلامة المحاكاة")}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{tr("Risk settings", "إعدادات المخاطر")}</h1><p className="mt-2 max-w-3xl text-sm text-foreground-secondary">{tr("These boundaries only govern paper-trading records in CryptoDash. They cannot connect to an exchange, move funds, or guarantee a trading outcome.", "تحكم هذه الحدود سجلات التداول الورقي في Nexus فقط. ولا يمكنها الاتصال ببورصة أو نقل أموال أو ضمان نتيجة تداول.")}</p></div><button type="button" onClick={submit} disabled={save.isPending} className="nx-button inline-flex items-center justify-center gap-2 bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none"><Save className="size-4" aria-hidden="true" />{save.isPending ? tr("Saving…", "جارٍ الحفظ…") : tr("Save protections", "حفظ الحماية")}</button></div></header><div className="container grid gap-4 py-6 lg:grid-cols-3"><aside className="rounded-md border border-warning/30 bg-warning/10 p-5 text-sm text-warning lg:col-span-1"><AlertTriangle className="size-5" aria-hidden="true" /><h2 className="mt-3 font-semibold">{tr("Deliberate boundaries", "حدود مقصودة")}</h2><p className="mt-2 leading-6">{tr("The server rejects unsafe or internally inconsistent settings. A new paper plan is always recalculated from fresh public market data before confirmation.", "يرفض الخادم الإعدادات غير الآمنة أو غير المتسقة داخليًا. وتُعاد حسبة كل خطة ورقية جديدة من بيانات سوق عامة حديثة قبل التأكيد.")}</p><button type="button" onClick={() => settingsQuery.data && setForm(fromSettings(settingsQuery.data))} className="nx-button mt-4 inline-flex items-center gap-2 border border-warning/30 px-3 py-2 text-xs font-semibold hover:bg-warning/10 focus-visible:outline-none"><RotateCcw className="size-3.5" aria-hidden="true" />{tr("Revert unsaved changes", "التراجع عن التغييرات غير المحفوظة")}</button></aside><section className="nx-panel p-5 lg:col-span-2"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-md bg-success/10 text-success"><ShieldCheck className="size-5" aria-hidden="true" /></span><div><h2 className="font-semibold">{tr("Position and daily limits", "حدود المراكز واليوم")}</h2><p className="text-sm text-foreground-secondary">{tr("All percentage fields are measured against virtual equity.", "تقاس جميع الحقول النسبية مقابل رأس المال الافتراضي.")}</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{riskFieldLabels.map(([key, en, ar]) => <label key={key} className="block"><span className="mb-2 block text-xs font-medium text-foreground-secondary">{tr(en, ar)}</span><input dir="ltr" value={form[key]} onChange={(event) => set(key, event.target.value)} inputMode="decimal" type="number" step="any" className="nexus-numeric w-full rounded-md border border-border bg-background-secondary px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25" /></label>)}<label className="block"><span className="mb-2 block text-xs font-medium text-foreground-secondary">{tr("Default protective stop", "وقف الحماية الافتراضي")}</span><select value={form.stopMethod} onChange={(event) => set("stopMethod", event.target.value as FormState["stopMethod"])} className="w-full rounded-md border border-border bg-background-secondary px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"><option value="atr">{tr("ATR based", "مبني على ATR")}</option><option value="fixed">{tr("Fixed percentage", "نسبة ثابتة")}</option><option value="structure">{tr("Market structure", "بنية السوق")}</option></select></label><label className="flex items-center gap-3 rounded-md border border-border bg-background-secondary p-3 sm:col-span-2"><input checked={form.blockHighVolatility} onChange={(event) => set("blockHighVolatility", event.target.checked)} type="checkbox" className="size-4 accent-primary" /><span><span className="block text-sm font-medium">{tr("Block high-volatility plans", "حظر الخطط مرتفعة التذبذب")}</span><span className="text-xs text-foreground-secondary">{tr("Require risk level below HIGH before a new paper purchase can be stored.", "يتطلب مستوى مخاطر أقل من HIGH قبل حفظ شراء ورقي جديد.")}</span></span></label></div></section></div></main>;
}
