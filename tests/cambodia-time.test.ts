import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { cambodiaCalendarDate, cambodiaDayBounds, cambodiaTodayBounds, formatCambodiaDate } from "../lib/utils/cambodia-time";
import { cardDateBounds, DEFAULT_CARD_FILTERS } from "../lib/cards/search";

const cases = [
  ["2026-10-11T16:59:59.999Z", "2026-10-11", "2026-10-10T17:00:00.000Z", "2026-10-11T17:00:00.000Z"],
  ["2026-10-11T17:00:00.000Z", "2026-10-12", "2026-10-11T17:00:00.000Z", "2026-10-12T17:00:00.000Z"],
  ["2026-10-31T16:59:59.999Z", "2026-10-31", "2026-10-30T17:00:00.000Z", "2026-10-31T17:00:00.000Z"],
  ["2026-10-31T17:00:00.000Z", "2026-11-01", "2026-10-31T17:00:00.000Z", "2026-11-01T17:00:00.000Z"],
  ["2026-12-31T16:59:59.999Z", "2026-12-31", "2026-12-30T17:00:00.000Z", "2026-12-31T17:00:00.000Z"],
  ["2026-12-31T17:00:00.000Z", "2027-01-01", "2026-12-31T17:00:00.000Z", "2027-01-01T17:00:00.000Z"],
  ["2024-02-28T17:00:00.000Z", "2024-02-29", "2024-02-28T17:00:00.000Z", "2024-02-29T17:00:00.000Z"],
  ["2024-02-29T17:00:00.000Z", "2024-03-01", "2024-02-29T17:00:00.000Z", "2024-03-01T17:00:00.000Z"],
] as const;

test("today and inclusive filters agree across Cambodia midnight, month/year rollover and leap days", () => {
  for (const [instant, day, from, until] of cases) {
    assert.equal(cambodiaCalendarDate(new Date(instant)), day);
    assert.deepEqual(cambodiaTodayBounds(new Date(instant)), {from, until});
    assert.deepEqual(cardDateBounds({...DEFAULT_CARD_FILTERS, from: day, to: day}), {from, until});
    const bounds = cambodiaDayBounds(day);
    assert.equal(cambodiaCalendarDate(new Date(Date.parse(bounds.until) - 1)), day);
    assert.notEqual(cambodiaCalendarDate(new Date(bounds.until)), day);
  }
  assert.deepEqual(cardDateBounds({...DEFAULT_CARD_FILTERS, from: "2026-12-31", to: "2027-01-02"}), {from: "2026-12-30T17:00:00.000Z", until: "2027-01-02T17:00:00.000Z"});
  assert.deepEqual(cardDateBounds({...DEFAULT_CARD_FILTERS, from: "2027-01-01"}), {from: "2026-12-31T17:00:00.000Z", until: null});
});

test("English and Khmer displayed dates change at Cambodia midnight without changing stored timestamps", () => {
  const value = "2026-12-31T17:00:00Z";
  assert.equal(formatCambodiaDate(value, "en-US", {dateStyle: "long"}), "January 1, 2027");
  for (const locale of ["en-US", "km-KH"]) {
    const expected = new Intl.DateTimeFormat(locale, {timeZone: "Asia/Phnom_Penh", dateStyle: "long", timeStyle: "short"}).format(new Date(value));
    assert.equal(formatCambodiaDate(value, locale, {dateStyle: "long", timeStyle: "short"}), expected);
    assert.notEqual(formatCambodiaDate("2026-12-31T16:59:59.999Z", locale, {dateStyle: "long"}), formatCambodiaDate(value, locale, {dateStyle: "long"}));
  }
});

test("calendar queries and formatting are independent of browser/host default time zone", () => {
  const script = `import {cambodiaTodayBounds, formatCambodiaDate} from './lib/utils/cambodia-time.ts';
    console.log(JSON.stringify({bounds:cambodiaTodayBounds(new Date('2026-12-31T17:00:00Z')), date:formatCambodiaDate('2026-12-31T17:00:00Z','en-US',{dateStyle:'long'})}));`;
  for (const timeZone of ["UTC", "America/Los_Angeles", "Pacific/Honolulu", "Asia/Tokyo"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {encoding: "utf8", env: {...process.env, TZ: timeZone}});
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {bounds:{from: "2026-12-31T17:00:00.000Z", until: "2027-01-01T17:00:00.000Z"}, date: "January 1, 2027"});
  }
});
