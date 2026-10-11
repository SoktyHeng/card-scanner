import type { Language, Parameters } from "./locale";
import khmer from "./km.json";
export const khmerMessages: Readonly<Record<string, string>> = khmer;
// English source messages are stable catalog keys. Only UI-owned text is passed
// here; user data and extraction contracts must never go through this function.
export function translate(language: Language, text: string, parameters: Parameters = {}) {
  if (language === "km") {
    const conversion = text.match(/^(.+) already has a value\. Copy it elsewhere or clear it before converting\. Both values have been kept\.$/);
    if (conversion && khmerMessages[conversion[1]]) return translate(language, "{field} already has a value. Copy it elsewhere or clear it before converting. Both values have been kept.", {field: khmerMessages[conversion[1]]});
    if (text.startsWith("Invalid option:") || text.startsWith("Invalid input:") || text.startsWith("Too big:") || text.startsWith("Too small:")) return khmerMessages["Check the highlighted fields before confirming."];
  }
  const localized = language === "km" ? khmerMessages[text.trim()] : undefined;
  const template = localized ? text.replace(text.trim(), localized) : text;
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, key: string) => parameters[key] === undefined ? match : String(parameters[key]));
}
