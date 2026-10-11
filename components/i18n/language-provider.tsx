"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { LANGUAGE_COOKIE, localeFor, type Language, type Parameters } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { formatCambodiaDate } from "@/lib/utils/cambodia-time";
const Context = createContext<{language: Language; setLanguage: (language: Language) => void}>({language: "en", setLanguage: () => {}});
export function LanguageProvider({ initialLanguage = "en", children }: { initialLanguage?: Language; children?: React.ReactNode }) {
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  function choose(next: Language) {
    setLanguage(next);
    document.cookie = `${LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  }
  return <Context.Provider value={{language,setLanguage:choose}}>{children}</Context.Provider>;
}
export function useLanguage() {
  const context = useContext(Context);
  return { ...context, t: (text: string, parameters?: Parameters) => translate(context.language, text, parameters),
    number: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(localeFor(context.language), options).format(value),
    date: (value: string | Date, options?: Omit<Intl.DateTimeFormatOptions, "timeZone">) => formatCambodiaDate(value, localeFor(context.language), options),
  };
}
export function T({ text, parameters }: { text: string; parameters?: Parameters }) { const {t} = useLanguage(); return <>{t(text, parameters)}</>; }
export function LanguageSelector() {
  const {language,setLanguage,t} = useLanguage();
  return <div className="flex flex-wrap items-center gap-2 text-sm"><label htmlFor="interface-language">{t("Language")}</label>
    <select id="interface-language" value={language} onChange={event => setLanguage(event.target.value === "km" ? "km" : "en")} className="min-h-11 max-w-full rounded-lg border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring">
      <option value="en" lang="en">English</option><option value="km" lang="km">ខ្មែរ</option>
    </select>
    <span role="status" aria-live="polite" className="sr-only">{t("Interface language: {language}", {language: language === "km" ? "ខ្មែរ" : "English"})}</span>
  </div>;
}
