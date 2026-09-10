/**
 * Fechas y horas del Inbox SIEMPRE en hora de Colombia (America/Bogota),
 * sin depender de la zona horaria del navegador.
 */
export const INBOX_TZ = "America/Bogota";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: INBOX_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("es-CO", { timeZone: INBOX_TZ, hour: "numeric", minute: "2-digit", hour12: true });
const longDateFmt = new Intl.DateTimeFormat("es-CO", { timeZone: INBOX_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const compactDateFmt = new Intl.DateTimeFormat("es-CO", { timeZone: INBOX_TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/** YYYY-MM-DD en Bogotá. */
export function bogotaDayKey(v: string | Date): string {
  return dayKeyFmt.format(toDate(v));
}

/** "3:24 p. m." */
export function formatBogotaTime(v: string | Date): string {
  return timeFmt.format(toDate(v)).replace(/\s?a\.\s?m\./i, " a. m.").replace(/\s?p\.\s?m\./i, " p. m.");
}

/** "mié, 10 sept 2026, 3:24 p. m." */
export function formatBogotaDateTime(v: string | Date): string {
  const d = toDate(v);
  return `${compactDateFmt.format(d)}, ${formatBogotaTime(d)}`;
}

/** "Hoy" / "Ayer" / "miércoles, 10 de septiembre de 2026" */
export function bogotaDayLabel(v: string | Date, now: Date = new Date()): string {
  const key = bogotaDayKey(v);
  if (key === bogotaDayKey(now)) return "Hoy";
  if (key === bogotaDayKey(new Date(now.getTime() - 86400_000))) return "Ayer";
  const label = longDateFmt.format(toDate(v));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Lista de chats: hora si es hoy, "Ayer", o dd/MM. */
export function formatListTimestamp(v: string | Date, now: Date = new Date()): string {
  const key = bogotaDayKey(v);
  if (key === bogotaDayKey(now)) return formatBogotaTime(v);
  if (key === bogotaDayKey(new Date(now.getTime() - 86400_000))) return "Ayer";
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}
