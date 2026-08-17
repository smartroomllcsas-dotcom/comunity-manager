import Link from 'next/link';
import { PenTool, Calendar, Sparkles, Camera, Users, MessageSquare, Play } from 'lucide-react';

const PILLARS = [
  { name: 'Educación', color: 'oklch(72% 0.15 250)', drafts: 4, scheduled: 6 },
  { name: 'Producto', color: 'oklch(70% 0.16 145)', drafts: 2, scheduled: 3 },
  { name: 'Comunidad', color: 'oklch(72% 0.15 320)', drafts: 3, scheduled: 5 },
  { name: 'Reservas', color: 'oklch(75% 0.15 60)', drafts: 1, scheduled: 2 },
];

const PLATFORMS = [
  { key: 'ig', name: 'Instagram', icon: Camera, count: 12, color: 'oklch(65% 0.20 20)' },
  { key: 'fb', name: 'Facebook', icon: Users, count: 8, color: 'oklch(60% 0.16 250)' },
  { key: 'tw', name: 'Twitter/X', icon: MessageSquare, count: 5, color: 'oklch(70% 0.05 250)' },
  { key: 'yt', name: 'YouTube', icon: Play, count: 2, color: 'oklch(60% 0.20 20)' },
];

const CALENDAR_WEEK = [
  { day: 'Lun', posts: 2, active: true },
  { day: 'Mar', posts: 3, active: false },
  { day: 'Mié', posts: 1, active: false },
  { day: 'Jue', posts: 4, active: false },
  { day: 'Vie', posts: 2, active: false },
  { day: 'Sáb', posts: 1, active: false },
  { day: 'Dom', posts: 0, active: false },
];

export default function OsContentPage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Contenido</h1>
          <div className="page-sub">
            Pipeline editorial: pilares → drafts → aprobación → publicación multi-canal
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {[
          { label: 'Drafts activos', value: '10', hint: 'pendiente aprobación' },
          { label: 'Programados esta semana', value: '13', hint: 'próximas 7d' },
          { label: 'Publicados 30d', value: '87', hint: 'reach 24.3k' },
          { label: 'Engagement rate', value: '4.2%', hint: '+0.6 vs mes ant' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>{k.label}</div>
            <div className="text-2xl font-semibold mt-1" style={{ color: 'var(--text-1)' }}>{k.value}</div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-2)' }}>{k.hint}</div>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>Pilares de contenido</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PILLARS.map(p => (
            <article key={p.name} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{p.name}</div>
              </div>
              <div className="mt-3 flex items-baseline gap-4">
                <div>
                  <div className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>{p.drafts}</div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>drafts</div>
                </div>
                <div>
                  <div className="text-xl font-semibold" style={{ color: p.color }}>{p.scheduled}</div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>programados</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>Calendario · esta semana</h2>
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="grid grid-cols-7 gap-2">
            {CALENDAR_WEEK.map(d => (
              <div
                key={d.day}
                className="rounded-lg p-3 text-center"
                style={{
                  background: d.active ? 'oklch(70% 0.14 250 / 0.15)' : 'transparent',
                  border: d.active ? '1px solid oklch(70% 0.14 250 / 0.4)' : '1px solid var(--border)',
                }}
              >
                <div className="text-[10px] uppercase tracking-wider" style={{ color: d.active ? 'oklch(80% 0.14 250)' : 'var(--text-2)' }}>{d.day}</div>
                <div className="text-2xl font-semibold mt-1" style={{ color: 'var(--text-1)' }}>{d.posts}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-2)' }}>{d.posts === 1 ? 'post' : 'posts'}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>Distribución por plataforma · 30d</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PLATFORMS.map(p => (
            <div key={p.key} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${p.color} / 0.12`, color: p.color }}>
                <p.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{p.count}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>{p.name}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 flex flex-wrap gap-2">
        <Link href="/broadcasts" className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: 'oklch(70% 0.14 250)', color: 'white' }}>
          <PenTool className="h-4 w-4" />
          Crear post
        </Link>
        <Link href="/broadcasts" className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-white/5" style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}>
          <Calendar className="h-4 w-4" />
          Ver calendario completo
        </Link>
        <Link href="/es/os/skills" className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-white/5" style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}>
          <Sparkles className="h-4 w-4" />
          Skills de contenido
        </Link>
      </section>
    </main>
  );
}
