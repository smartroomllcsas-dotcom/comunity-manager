"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, MessageSquare, Phone, RefreshCw, X } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { BrandPicker } from "@/components/broadcasts/BrandPicker";

export const dynamic = "force-dynamic";

type Meeting = {
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
  when: string;
  startsAt: string;
  status: string;
  url: string | null;
  conversationId: string | null;
};

const TZ = "America/Bogota";
const STATUS: Record<string, { label: string; cls: string }> = {
  agendada: { label: "Agendada", cls: "bg-green-500/15 text-green-300 border-green-500/30" },
  reprogramada: { label: "Reprogramada", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  cancelada: { label: "Cancelada", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
};

/** Fecha local (Bogotá) YYYY-MM-DD de un ISO. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });
}
function todayKey(): string {
  return dayKey(new Date().toISOString());
}

export default function AgendaPage() {
  const { activeClientId, activeClient } = useActiveBrand();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);
  const [calcomUrl, setCalcomUrl] = useState<string>("https://cal.smartgenapp.com/bookings/upcoming");
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showBooking, setShowBooking] = useState(false);

  const load = useCallback(async () => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda?clientId=${activeClientId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la agenda");
      setMeetings(data.meetings || []);
      setBookingUrl(data.bookingUrl || null);
      if (data.calcomUrl) setCalcomUrl(data.calcomUrl);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeClientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, Meeting[]>();
    for (const x of meetings) {
      const k = dayKey(x.startsAt);
      m.set(k, [...(m.get(k) || []), x]);
    }
    return m;
  }, [meetings]);

  const nowIso = new Date().toISOString();
  const upcoming = meetings.filter((m) => m.startsAt >= nowIso && m.status !== "cancelada");
  const past = meetings.filter((m) => m.startsAt < nowIso).reverse();

  // Cuadrícula del mes (lunes a domingo)
  const grid = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const offset = (first.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ key: `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const today = todayKey();
  const selectedList = selectedDay ? byDay.get(selectedDay) || [] : [];

  if (!activeClientId) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-[#8b949e]">Elige la empresa para ver su agenda.</p>
        <BrandPicker />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22] flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-semibold text-white flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-300" /> Agenda</h1>
          <p className="text-xs text-[#8b949e]">Reuniones agendadas por Cal.com con los leads de <span className="text-white">{activeClient?.name}</span>.</p>
        </div>
        <BrandPicker />
        <button onClick={() => void load()} className="rounded-md border border-[#2d333b] p-2 text-[#8b949e] hover:text-white" title="Actualizar"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        <button onClick={() => setShowBooking(true)} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-2 text-sm font-medium text-white">
          <CalendarDays className="h-4 w-4" /> Agendar reunión
        </button>
        <a href={calcomUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#2d333b] px-3 py-2 text-sm text-white hover:bg-[#21262d]">
          <ExternalLink className="h-4 w-4" /> Abrir Cal.com
        </a>
      </div>

      <div className="p-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Calendario mensual */}
        <div className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))} className="rounded p-1 text-[#8b949e] hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-sm font-semibold text-white capitalize">{monthLabel}</div>
            <button onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))} className="rounded p-1 text-[#8b949e] hover:text-white"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[#8b949e] mb-1">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, i) => {
              if (!cell) return <div key={i} className="h-16" />;
              const list = byDay.get(cell.key) || [];
              const isToday = cell.key === today;
              const isSel = cell.key === selectedDay;
              return (
                <button
                  key={cell.key}
                  onClick={() => setSelectedDay(cell.key)}
                  className={`h-16 rounded-md border p-1 text-left align-top transition-colors ${isSel ? "border-blue-500/60 bg-blue-500/10" : "border-[#2d333b] hover:bg-[#21262d]"}`}
                >
                  <div className={`text-[11px] ${isToday ? "font-bold text-blue-300" : "text-[#8b949e]"}`}>{cell.day}</div>
                  {list.slice(0, 2).map((m) => (
                    <div key={m.contactId} className={`mt-0.5 truncate rounded px-1 text-[10px] ${m.status === "cancelada" ? "bg-red-500/15 text-red-300 line-through" : "bg-green-500/15 text-green-200"}`}>
                      {timeOf(m.startsAt)} {m.name.split(" ")[0]}
                    </div>
                  ))}
                  {list.length > 2 && <div className="text-[10px] text-[#8b949e]">+{list.length - 2}</div>}
                </button>
              );
            })}
          </div>
          {selectedDay && (
            <div className="mt-3 rounded-md border border-[#2d333b] bg-[#0d1117] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs text-[#8b949e]">{new Date(`${selectedDay}T12:00:00-05:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</div>
                <button onClick={() => setSelectedDay(null)} className="text-[#8b949e] hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </div>
              {selectedList.length === 0 ? <p className="text-xs text-[#6e7681]">Sin reuniones este día.</p> : selectedList.map((m) => <MeetingRow key={m.contactId} m={m} />)}
            </div>
          )}
        </div>

        {/* Próximas y pasadas */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
            <h2 className="text-sm font-semibold text-white mb-2">Próximas reuniones <span className="text-[#8b949e] font-normal">({upcoming.length})</span></h2>
            {upcoming.length === 0 ? (
              <p className="text-xs text-[#6e7681]">No hay reuniones próximas. Cuando un lead agende por Cal.com aparece aquí sola.</p>
            ) : (
              <div className="space-y-2">{upcoming.slice(0, 20).map((m) => <MeetingRow key={m.contactId} m={m} />)}</div>
            )}
          </div>
          <div className="rounded-xl border border-[#2d333b] bg-[#161b22] p-4">
            <h2 className="text-sm font-semibold text-white mb-2">Pasadas <span className="text-[#8b949e] font-normal">({past.length})</span></h2>
            {past.length === 0 ? <p className="text-xs text-[#6e7681]">—</p> : <div className="space-y-2">{past.slice(0, 15).map((m) => <MeetingRow key={m.contactId} m={m} muted />)}</div>}
          </div>
        </div>
      </div>

      {showBooking && activeClientId && (
        <ScheduleModal
          clientId={activeClientId}
          brandName={activeClient?.name || ""}
          bookingUrl={bookingUrl}
          onClose={() => setShowBooking(false)}
          onSaved={() => {
            setShowBooking(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function MeetingRow({ m, muted }: { m: Meeting; muted?: boolean }) {
  const st = STATUS[m.status] || STATUS.agendada;
  return (
    <div className={`rounded-md border border-[#2d333b] px-3 py-2 ${muted ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2">
        <Link href={`/contacts/${m.contactId}`} className="text-sm font-medium text-white hover:underline truncate">{m.name}</Link>
        <span className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
      </div>
      <div className="text-xs text-[#8b949e]">{m.when || new Date(m.startsAt).toLocaleString("es-CO", { timeZone: TZ })}{m.title ? ` · ${m.title}` : ""}</div>
      <div className="mt-1 flex items-center gap-3 text-[11px]">
        {m.phone && <span className="inline-flex items-center gap-1 text-[#8b949e]"><Phone className="h-3 w-3" /> {m.phone}</span>}
        {m.conversationId && <Link href="/inbox" className="inline-flex items-center gap-1 text-blue-300 hover:underline"><MessageSquare className="h-3 w-3" /> Chat</Link>}
        {m.url && <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-300 hover:underline"><ExternalLink className="h-3 w-3" /> Cal.com</a>}
      </div>
    </div>
  );
}

type ContactHit = { id: string; name: string; phone: string | null; email: string | null; stage: string | null };

function ScheduleModal({
  clientId,
  brandName,
  bookingUrl,
  onClose,
  onSaved,
}: {
  clientId: string;
  brandName: string;
  bookingUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [contact, setContact] = useState<ContactHit | null>(null);
  const [mode, setMode] = useState<"manual" | "calcom">("manual");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/agenda/contacts?clientId=${clientId}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setHits(data.contacts || []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, clientId]);

  async function save() {
    if (!contact) return toast.error("Elige el contacto");
    if (!date || !time) return toast.error("Elige fecha y hora");
    setSaving(true);
    try {
      // Hora de Colombia (UTC-5, sin horario de verano)
      const startsAt = new Date(`${date}T${time}:00-05:00`).toISOString();
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, contactId: contact.id, startsAt, durationMin: duration, title: title || undefined, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo agendar");
      toast.success(`Reunión agendada: ${data.when}`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const calcomSrc = bookingUrl && contact
    ? `${bookingUrl}${bookingUrl.includes("?") ? "&" : "?"}name=${encodeURIComponent(contact.name)}${contact.email ? `&email=${encodeURIComponent(contact.email)}` : ""}`
    : bookingUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className={`w-full ${mode === "calcom" && contact ? "max-w-4xl h-[85vh]" : "max-w-xl"} rounded-xl border border-[#2d333b] bg-[#0d1117] overflow-hidden flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d333b]">
          <div className="text-sm font-medium text-white">Agendar reunión · {brandName}</div>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {/* 1. Contacto */}
          {!contact ? (
            <div>
              <label className="block text-xs text-[#8b949e] mb-1">¿Con quién? Busca por nombre o teléfono</label>
              <input autoFocus className="w-full rounded-md bg-[#161b22] border border-[#2d333b] px-3 py-2 text-sm text-white" placeholder="Ej: Juan o 3163028683" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-[#2d333b]">
                {searching && hits.length === 0 ? <p className="p-3 text-xs text-[#8b949e]">Buscando…</p> : hits.length === 0 ? <p className="p-3 text-xs text-[#8b949e]">Sin resultados en esta empresa.</p> : hits.map((h) => (
                  <button key={h.id} onClick={() => setContact(h)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#161b22] border-b border-[#2d333b]/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-white">{h.name}</div>
                      <div className="text-[11px] text-[#8b949e]">{h.phone || "sin teléfono"}{h.email ? ` · ${h.email}` : ""}</div>
                    </div>
                    {h.stage && <span className="shrink-0 rounded-full border border-[#2d333b] px-2 py-0.5 text-[10px] text-[#8b949e]">{h.stage}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-[#2d333b] bg-[#161b22] px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">{contact.name}</div>
                <div className="text-[11px] text-[#8b949e]">{contact.phone || "sin teléfono"}{contact.email ? ` · ${contact.email}` : ""}</div>
              </div>
              <button onClick={() => setContact(null)} className="text-xs text-blue-300 hover:underline">Cambiar</button>
            </div>
          )}

          {contact && (
            <>
              {/* 2. Modo */}
              <div className="flex gap-2">
                <button onClick={() => setMode("manual")} className={`rounded-full border px-3 py-1 text-xs ${mode === "manual" ? "border-blue-500/50 bg-blue-500/20 text-blue-200" : "border-[#2d333b] text-[#8b949e]"}`}>Registrar en el CRM</button>
                {bookingUrl && (
                  <button onClick={() => setMode("calcom")} className={`rounded-full border px-3 py-1 text-xs ${mode === "calcom" ? "border-blue-500/50 bg-blue-500/20 text-blue-200" : "border-[#2d333b] text-[#8b949e]"}`}>Por Cal.com (con enlace de videollamada)</button>
                )}
              </div>

              {mode === "manual" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="block text-xs text-[#8b949e] mb-1">Fecha</label>
                      <input type="date" className="w-full rounded-md bg-[#161b22] border border-[#2d333b] px-3 py-2 text-sm text-white" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8b949e] mb-1">Hora</label>
                      <input type="time" className="w-full rounded-md bg-[#161b22] border border-[#2d333b] px-3 py-2 text-sm text-white" value={time} onChange={(e) => setTime(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8b949e] mb-1">Duración</label>
                      <select className="w-full rounded-md bg-[#161b22] border border-[#2d333b] px-3 py-2 text-sm text-white" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                        {[15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Título (opcional)</label>
                    <input className="w-full rounded-md bg-[#161b22] border border-[#2d333b] px-3 py-2 text-sm text-white" placeholder="Ej: Presentación de propuesta" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Nota (opcional, queda en el chat)</label>
                    <textarea rows={2} className="w-full rounded-md bg-[#161b22] border border-[#2d333b] px-3 py-2 text-sm text-white" value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  <p className="text-[11px] text-[#6e7681]">Se guarda en la ficha del contacto, aparece en la Home y en este calendario, y el recordatorio por WhatsApp (si está activo) le llega antes de la hora.</p>
                  <div className="flex justify-end">
                    <button disabled={saving} onClick={() => void save()} className="rounded-md bg-green-600 hover:bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Guardando…" : "Agendar"}</button>
                  </div>
                </div>
              ) : (
                calcomSrc && <iframe src={calcomSrc} className="h-[62vh] w-full rounded-md bg-white" title="Cal.com" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
