export type Language = "en" | "km";
export const LANGUAGE_COOKIE = "card-scanner-language";
export function parseLanguage(value: unknown): Language { return value === "km" ? "km" : "en"; }
export function localeFor(language: Language) { return language === "km" ? "km-KH" : "en-US"; }
export type Parameters = Record<string, string | number>;
