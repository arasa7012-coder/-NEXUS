import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { languageMetadata, messages, type Language, type TranslationKey } from "@/i18n/messages";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  direction: "ltr" | "rtl";
  locale: string;
  t: (key: TranslationKey) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDateTime: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function isLanguage(value: string | null): value is Language {
  return value !== null && Object.hasOwn(languageMetadata, value);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem("nexus-language");
    return isLanguage(saved) ? saved : "en";
  });
  const metadata = languageMetadata[language];
  const direction = metadata.direction;

  useEffect(() => {
    document.documentElement.lang = metadata.tag;
    document.documentElement.dir = direction;
    document.documentElement.dataset.language = language;
    localStorage.setItem("nexus-language", language);
  }, [direction, language, metadata.tag]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage((current) => current === "ar" ? "en" : "ar"),
    direction,
    locale: metadata.tag,
    t: (key) => messages[language][key],
    formatNumber: (number, options) => new Intl.NumberFormat(metadata.tag, options).format(number),
    formatDateTime: (date, options) => new Intl.DateTimeFormat(metadata.tag, options).format(date),
  }), [direction, language, metadata.tag]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

const fallbackLanguage: LanguageContextValue = {
  language: "en",
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  direction: "ltr",
  locale: languageMetadata.en.tag,
  t: (key) => messages.en[key],
  formatNumber: (number, options) => new Intl.NumberFormat(languageMetadata.en.tag, options).format(number),
  formatDateTime: (date, options) => new Intl.DateTimeFormat(languageMetadata.en.tag, options).format(date),
};

export function useLanguage() {
  return useContext(LanguageContext) ?? fallbackLanguage;
}
