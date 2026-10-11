import "./fixtures/dom";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { LanguageProvider, LanguageSelector, T, useLanguage } from "../components/i18n/language-provider";
import { khmerMessages, translate } from "../lib/i18n/messages";
import { LANGUAGE_COOKIE, parseLanguage } from "../lib/i18n/locale";
import { extractionMessages } from "../lib/ai/card-schema";
import { saveMessages } from "../lib/cards/save-schema";
import { draftMessages } from "../lib/drafts/schema";
import { fieldLabels } from "../lib/cards/review";
import { duplicateReasons } from "../lib/cards/duplicates";
afterEach(cleanup);

test("catalog covers operational errors and field labels, preserves interpolation tokens, and falls back to English", () => {
  for (const text of [...Object.values(extractionMessages), ...Object.values(saveMessages), ...Object.values(draftMessages), ...Object.values(fieldLabels), ...Object.values(duplicateReasons)]) assert.ok(khmerMessages[text], text);
  for (const [english, khmer] of Object.entries(khmerMessages)) {
    const tokens = (value: string) => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
    assert.deepEqual(tokens(english), tokens(khmer), english);
  }
  assert.equal(translate("km", "Uncatalogued message"), "Uncatalogued message");
  assert.equal(translate("km", "Open {name}", {name: "Dashboard {language} <script>"}), "បើក Dashboard {language} <script>");
  assert.equal(parseLanguage("km"), "km");
  for (const invalid of [null, "KM", "fr", "km; path=/", undefined]) assert.equal(parseLanguage(invalid), "en");
});

function Formatting() {
  const { date, number } = useLanguage();
  return createElement("div", null, createElement("time", null, date("2026-10-11T18:00:00Z", {dateStyle: "long"})), createElement("output", null, number(12345.67)));
}
test("language switch changes document language, cookie, announcements and date/number presentation without navigation", () => {
  const view = render(createElement(LanguageProvider, null, createElement(LanguageSelector), createElement(T, {text: "Dashboard"}), createElement(Formatting)));
  const selector = view.getByLabelText("Language");
  assert.equal(view.container.querySelector("time")?.textContent, new Intl.DateTimeFormat("en-US", {timeZone: "Asia/Phnom_Penh", dateStyle: "long"}).format(new Date("2026-10-11T18:00:00Z")));
  selector.focus();
  fireEvent.change(selector, {target: {value: "km"}});
  assert.equal(document.documentElement.lang, "km");
  assert.ok(document.cookie.includes(`${LANGUAGE_COOKIE}=km`));
  assert.equal(document.activeElement, selector);
  assert.ok(view.getByText("ផ្ទាំងសង្ខេប"));
  assert.match(view.container.querySelector('[aria-live="polite"]')?.textContent ?? "", /ខ្មែរ/);
  assert.equal(view.container.querySelector("time")?.textContent, new Intl.DateTimeFormat("km-KH", {timeZone: "Asia/Phnom_Penh", dateStyle: "long"}).format(new Date("2026-10-11T18:00:00Z")));
  fireEvent.change(selector, {target: {value: "en"}});
  assert.equal(document.documentElement.lang, "en");
  assert.ok(view.getByText("Dashboard"));
});

test("Khmer validation feedback is accessible and does not discard invalid review edits", async () => {
  const { CardReviewForm } = await import("../components/cards/card-review-form");
  const { businessCard } = await import("./fixtures/extraction");
  const source = businessCard();
  source.email = "user@example.com";
  source.fieldConfidences.email = 0.9;
  let confirmed = false;
  const view = render(createElement(LanguageProvider, {initialLanguage: "km"}, createElement(CardReviewForm, {extraction: source, onChange: () => {}, onConfirm: () => {confirmed = true;}})));
  const email = view.getByLabelText(translate("km", "Email")) as HTMLInputElement;
  fireEvent.change(email, {target: {value: "invalid email"}});
  fireEvent.click(view.getByRole("button", {name: translate("km", "Save card")}));
  assert.equal(confirmed, false);
  assert.equal(email.value, "invalid email");
  assert.equal(email.getAttribute("aria-invalid"), "true");
  assert.ok(view.getAllByText(translate("km", "Enter a valid email address or leave it blank.")).length > 0);
  assert.ok(view.getByRole("alert").textContent?.includes(translate("km", "Check the highlighted fields before confirming.")));
  assert.equal(view.queryByRole("dialog"), null);
});
