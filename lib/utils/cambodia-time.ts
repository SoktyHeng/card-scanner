// One policy for calendar-day queries and user-facing timestamps.
export const CAMBODIA_TIME_ZONE = "Asia/Phnom_Penh";
const DAY_MS = 24 * 60 * 60 * 1000;
const calendar = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMBODIA_TIME_ZONE,
  calendar: "iso8601",
  numberingSystem: "latn",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

function parts(value: Date) {
  return Object.fromEntries(calendar.formatToParts(value).map(part => [part.type, part.value]));
}

export function cambodiaCalendarDate(value: Date = new Date()) {
  const { year, month, day } = parts(value);
  return `${year}-${month}-${day}`;
}

function midnight(day: string) {
  const nominal = Date.parse(`${day}T00:00:00Z`);
  let instant = nominal;
  // Resolve local midnight with the IANA zone, including historical offsets.
  // UTC parsing and arithmetic keep the host's time zone out of the calculation.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { year, month, day: date, hour, minute, second } = parts(new Date(instant));
    const local = Date.parse(`${year}-${month}-${date}T${hour}:${minute}:${second}Z`);
    instant = nominal - (local - instant);
  }
  return new Date(instant).toISOString();
}

export function cambodiaDayBounds(day: string) {
  const nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  return { from: midnight(day), until: midnight(nextDay) };
}

export function cambodiaTodayBounds(now: Date = new Date()) {
  return cambodiaDayBounds(cambodiaCalendarDate(now));
}

export function formatCambodiaDate(value: string | Date, locale: string, options?: Omit<Intl.DateTimeFormatOptions, "timeZone">) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: CAMBODIA_TIME_ZONE }).format(new Date(value));
}
