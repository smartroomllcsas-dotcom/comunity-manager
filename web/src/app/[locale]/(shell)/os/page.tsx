import Link from "next/link";
import { cookies } from "next/headers";
import {
  Inbox,
  Users,
  Bot,
  CalendarCheck,
  UserPlus,
  MessageCircle,
  Sparkles,
  AlertTriangle,
  Plug,
  ArrowRight,
  Wand2,
  FileText,
  Phone,
} from "lucide-react";
import { loadHomeBrands, loadHomeOverview, resolveHomeIdentity, type HomeOverview } from "@/lib/home/overview";
import { HomeBrandSwitcher } from "@/components/home/HomeBrandSwitcher";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Helpers de presentación                                            */
/* ------------------------------------------------------------------ */
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" });
}

function channelLabel(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "waha") return "WhatsApp QR";
  if (t.includes("whatsapp")) return "WhatsApp";
  if (t === "instagram") return "Instagram";
  if (t === "facebook_messenger") return "Messenger";
  return "Chat";
}

const STAGE_COLOR: Record<string, string> = {
  Nuevo: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Tibio: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Calificado: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Oportunidad: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Cliente: "bg-green-500/20 text-green-300 border-green-500/40",
  Perdido: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

function StagePill({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-xs text-[var(--os-ink-3)]">Sin etapa</span>;
  const cls = STAGE_COLOR[stage] || "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{stage}</span>;
}

const card = "rounded-xl border border-[var(--os-line)] bg-[var(--os-paper-2)]";
const muted = "text-[var(--os-ink-3)]";
const ink = "text-[var(--os-ink)]";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  tone,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  hint: string;
  href: string;
  tone: string;
}) {
  return (
    <Link href={href} className={`${card} group flex flex-col gap-2 p-4 transition-colors hover:border-[var(--os-line-2)]`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${muted}`}>{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </div>
      <span className={`text-3xl font-semibold tracking-tight ${ink}`}>{value}</span>
      <span className={`text-[11px] ${muted}`}>{hint}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Página                                                             */
/* ------------------------------------------------------------------ */
export default async function HomePage() {
  let overview: HomeOverview | null = null;
  let brands: Array<{ id: string; name: string }> = [];
  let error: string | null = null;

  try {
    const ent = await resolveHomeIdentity();
    if (!ent) throw new Error("Inicia sesión para ver tu resumen.");
    brands = await loadHomeBrands(ent.userId, ent.orgId);
    if (brands.length === 0) throw new Error("Aún no tienes una empresa configurada. Crea la primera en Clientes.");
    const cookieStore = await cookies();
    const wanted = cookieStore.get("cm_active_brand_id")?.value;
    const brand = brands.find((b) => b.id === wanted) || brands[0];
    overview = await loadHomeOverview({ orgId: ent.orgId, brand });
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo cargar el resumen.";
  }

  if (!overview) {
    return (
      <main className="content">
        <div className="page-head">
          <div>
            <h1 className="page-title">Inicio</h1>
            <div className="page-sub">{error}</div>
          </div>
        </div>
      </main>
    );
  }

  const o = overview;
  const hour = Number(new Date().toLocaleString("es-CO", { hour: "numeric", hour12: false, timeZone: "America/Bogota" }));
  const saludo = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const fecha = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });
  const maxWeek = Math.max(1, ...o.week.map((d) => Math.max(d.leads, d.replies)));
  const funnelMax = Math.max(1, ...o.funnel.map((f) => f.count));

  return (
    <main className="content">
      {/* Encabezado */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {saludo}. Así va <span className="text-[var(--os-accent)]">{o.brand.name}</span> hoy
          </h1>
          <div className="page-sub capitalize">{fecha}</div>
        </div>
        <HomeBrandSwitcher brands={brands} activeId={o.brand.id} />
      </div>

      {/* Números de hoy */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={UserPlus} label="Leads nuevos hoy" value={o.today.newLeads} hint="Personas que llegaron hoy" href="/contacts" tone="bg-sky-500/15 text-sky-300" />
        <StatCard icon={Inbox} label="Esperan respuesta" value={o.today.waitingReply} hint="Chats con mensajes sin leer" href="/inbox" tone="bg-amber-500/15 text-amber-300" />
        <StatCard icon={Bot} label="Atendidos por la IA hoy" value={o.today.botReplies} hint="Respuestas automáticas enviadas" href="/chatbot/ai" tone="bg-violet-500/15 text-violet-300" />
        <StatCard icon={MessageCircle} label="Respuestas del equipo hoy" value={o.today.humanReplies} hint="Mensajes enviados por asesores" href="/inbox" tone="bg-cyan-500/15 text-cyan-300" />
        <StatCard icon={CalendarCheck} label="Reuniones próximas" value={o.today.meetingsUpcoming} hint="Agendadas para los próximos 7 días" href="/contacts" tone="bg-emerald-500/15 text-emerald-300" />
        <StatCard icon={Sparkles} label="Calificados esta semana" value={o.today.qualifiedWeek} hint="Leads con intención real de compra" href="/contacts" tone="bg-green-500/15 text-green-300" />
      </section>

      {/* Atención + Canales */}
      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className={`text-sm font-semibold ${ink}`}>Necesita tu atención</h2>
              <p className={`text-xs ${muted}`}>Chats donde el cliente escribió y nadie ha leído su mensaje.</p>
            </div>
            <Link href="/inbox" className="flex items-center gap-1 text-xs font-medium text-[var(--os-accent)] hover:underline">
              Ir a la bandeja <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {o.attention.length === 0 ? (
            <p className={`rounded-lg border border-dashed border-[var(--os-line)] p-6 text-center text-sm ${muted}`}>
              Todo al día. No hay mensajes sin leer. ✔
            </p>
          ) : (
            <ul className="divide-y divide-[var(--os-line)]">
              {o.attention.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-semibold text-amber-300">
                    {c.unread}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm font-medium ${ink}`}>{c.contactName}</span>
                      <span className={`shrink-0 rounded border border-[var(--os-line)] px-1.5 py-0.5 text-[10px] ${muted}`}>
                        {channelLabel(c.channelType)}
                      </span>
                    </div>
                    <p className={`truncate text-xs ${muted}`}>{c.preview || "Mensaje sin texto"}</p>
                  </div>
                  <span className={`shrink-0 text-[11px] ${muted}`}>{timeAgo(c.lastMessageAt)}</span>
                  <Link href="/inbox" className="shrink-0 rounded-md border border-[var(--os-line)] px-2 py-1 text-[11px] font-medium text-[var(--os-ink-2)] hover:bg-[var(--os-paper-3)]">
                    Atender
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {(o.unreachableLeads > 0 || o.pendingSync > 0) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {o.pendingSync > 0 && (
                <Link href="/automatizacion-leads" className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-500/15">
                  <Wand2 className="h-4 w-4 shrink-0" />
                  <span><strong>{o.pendingSync}</strong> leads de formulario aún sin abordar. Sincronízalos.</span>
                </Link>
              )}
              {o.unreachableLeads > 0 && (
                <Link href="/automatizacion-leads" className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/15">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span><strong>{o.unreachableLeads}</strong> leads no se pudieron contactar por WhatsApp. Llámalos o escríbeles por correo.</span>
                </Link>
              )}
            </div>
          )}
        </div>

        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className={`text-sm font-semibold ${ink}`}>Tus canales</h2>
              <p className={`text-xs ${muted}`}>Por dónde te escriben tus clientes.</p>
            </div>
            <Link href="/settings/channels" className="flex items-center gap-1 text-xs font-medium text-[var(--os-accent)] hover:underline">
              <Plug className="h-3 w-3" /> Canales
            </Link>
          </div>
          <ul className="space-y-2">
            {o.channels.map((ch) => {
              const ok = ch.state === "active" || ch.state === "activity";
              const bad = ch.state === "error" || ch.state === "disconnected";
              const dot = ok ? "bg-emerald-400" : bad ? "bg-red-400" : "bg-zinc-500";
              return (
                <li key={ch.kind} className="flex items-center gap-3 rounded-lg border border-[var(--os-line)] px-3 py-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${ink}`}>{ch.label}</div>
                    <div className={`truncate text-[11px] ${muted}`}>{ch.name ? `${ch.name} · ` : ""}{ch.hint}</div>
                  </div>
                  {ch.state === "missing" && (
                    <Link href="/settings/channels" className="text-[11px] font-medium text-[var(--os-accent)] hover:underline">Conectar</Link>
                  )}
                  {bad && (
                    <Link href="/settings/channels" className="flex items-center gap-1 text-[11px] font-medium text-red-300 hover:underline">
                      <AlertTriangle className="h-3 w-3" /> Revisar
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Semana + Embudo + Reuniones */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className={`${card} p-4`}>
          <h2 className={`text-sm font-semibold ${ink}`}>Últimos 7 días</h2>
          <p className={`mb-4 text-xs ${muted}`}>
            <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-400" /> Leads nuevos</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet-400" /> Respuestas de la IA</span>
          </p>
          <div className="flex h-36 items-end gap-2">
            {o.week.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-28 w-full items-end justify-center gap-0.5">
                  <div title={`${d.leads} leads`} className="w-1/2 rounded-t bg-sky-400/80" style={{ height: `${Math.max(4, (d.leads / maxWeek) * 100)}%` }} />
                  <div title={`${d.replies} respuestas IA`} className="w-1/2 rounded-t bg-violet-400/80" style={{ height: `${Math.max(4, (d.replies / maxWeek) * 100)}%` }} />
                </div>
                <span className={`text-[10px] capitalize ${muted}`}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${card} p-4`}>
          <h2 className={`text-sm font-semibold ${ink}`}>Embudo de leads</h2>
          <p className={`mb-4 text-xs ${muted}`}>En qué etapa está cada persona que te ha escrito.</p>
          <ul className="space-y-2">
            {o.funnel.map((f) => (
              <li key={f.stage} className="flex items-center gap-3">
                <span className={`w-24 shrink-0 text-xs ${muted}`}>{f.stage}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--os-paper-3)]">
                  <div className="h-full rounded-full bg-[var(--os-accent)]/70" style={{ width: `${Math.max(2, (f.count / funnelMax) * 100)}%` }} />
                </div>
                <span className={`w-8 shrink-0 text-right text-xs font-medium ${ink}`}>{f.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${card} p-4`}>
          <h2 className={`text-sm font-semibold ${ink}`}>Próximas reuniones</h2>
          <p className={`mb-3 text-xs ${muted}`}>Citas agendadas por tus leads.</p>
          {o.meetings.length === 0 ? (
            <p className={`rounded-lg border border-dashed border-[var(--os-line)] p-5 text-center text-xs ${muted}`}>
              No hay reuniones agendadas todavía.
            </p>
          ) : (
            <ul className="space-y-2">
              {o.meetings.map((m) => (
                <li key={m.contactId}>
                  <Link href={`/contacts/${m.contactId}`} className="flex items-center gap-3 rounded-lg border border-[var(--os-line)] px-3 py-2 hover:bg-[var(--os-paper-3)]">
                    <CalendarCheck className="h-4 w-4 shrink-0 text-emerald-300" />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-medium ${ink}`}>{m.name}</div>
                      <div className={`truncate text-[11px] ${muted}`}>{m.when}{m.title ? ` · ${m.title}` : ""}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Últimos leads */}
      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <h2 className={`text-sm font-semibold ${ink}`}>Últimos leads</h2>
            <p className={`text-xs ${muted}`}>Las personas más recientes que llegaron a {o.brand.name}.</p>
          </div>
          <Link href="/contacts" className="flex items-center gap-1 text-xs font-medium text-[var(--os-accent)] hover:underline">
            <Users className="h-3 w-3" /> Ver todos
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b border-[var(--os-line)] text-left text-[11px] ${muted}`}>
                <th className="px-4 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Llegó por</th>
                <th className="px-3 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 font-medium">Reunión</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {o.recentLeads.length === 0 && (
                <tr><td colSpan={5} className={`px-4 py-8 text-center text-xs ${muted}`}>Aún no hay leads.</td></tr>
              )}
              {o.recentLeads.map((l) => (
                <tr key={l.id} className="border-b border-[var(--os-line)]/60 hover:bg-[var(--os-paper-3)]">
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${l.id}`} className={`font-medium hover:underline ${ink}`}>{l.name}</Link>
                    {l.phone && <div className={`text-[11px] ${muted}`}>{l.phone}</div>}
                  </td>
                  <td className={`px-3 py-2 text-xs ${muted}`}>{l.source}</td>
                  <td className="px-3 py-2"><StagePill stage={l.stage} /></td>
                  <td className={`px-3 py-2 text-xs ${muted}`}>{l.meeting || "—"}</td>
                  <td className={`px-3 py-2 text-xs ${muted}`}>{fmtDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Accesos rápidos */}
      <section>
        <div className={`mb-2 text-[11px] font-medium uppercase tracking-wider ${muted}`}>Accesos rápidos</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/inbox", icon: Inbox, label: "Bandeja de entrada", desc: "Responde a tus clientes" },
            { href: "/contacts", icon: Users, label: "Contactos", desc: "Todos tus leads y clientes" },
            { href: "/automatizacion-leads", icon: Wand2, label: "Automatización de leads", desc: "Cómo atiende la IA" },
            { href: "/whatsapp/templates", icon: FileText, label: "Plantillas de WhatsApp", desc: "Mensajes aprobados por Meta" },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.href} href={a.href} className={`${card} group flex items-center gap-3 px-4 py-3 transition-colors hover:border-[var(--os-line-2)]`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--os-paper-3)] text-[var(--os-accent)]">
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                </span>
                <div className="min-w-0">
                  <div className={`text-[13px] font-semibold ${ink}`}>{a.label}</div>
                  <div className={`text-[11px] ${muted}`}>{a.desc}</div>
                </div>
                <ArrowRight className={`ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${muted}`} />
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
