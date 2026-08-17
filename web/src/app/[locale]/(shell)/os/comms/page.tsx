import Link from 'next/link';
import { Inbox, MessageSquare, Send, Hash, Mail, Phone } from 'lucide-react';

export default function OsCommsPage() {
  const lanes = [
    {
      icon: MessageSquare,
      label: 'WhatsApp',
      href: '/inbox?channel=whatsapp',
      status: 'Conectado',
      accent: 'oklch(70% 0.16 145)',
    },
    {
      icon: Send,
      label: 'Messenger',
      href: '/inbox?channel=facebook',
      status: 'Conectado',
      accent: 'oklch(70% 0.14 250)',
    },
    {
      icon: Inbox,
      label: 'Instagram DMs',
      href: '/inbox?channel=instagram',
      status: 'Conectado',
      accent: 'oklch(65% 0.20 20)',
    },
    { icon: Mail, label: 'Email (Gmail / IMAP)', href: '/es/os/integrations', status: 'Sin configurar', accent: 'oklch(65% 0.10 250)' },
    { icon: Hash, label: 'Slack workspace', href: '/es/os/integrations', status: 'Sin configurar', accent: 'oklch(65% 0.10 250)' },
    { icon: Phone, label: 'Llamadas + dictado', href: '/es/os/integrations', status: 'Próximamente', accent: 'oklch(65% 0.10 250)' },
  ];

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Comms unificado</h1>
          <div className="page-sub">
            Un solo inbox para WhatsApp, Messenger, Instagram, Slack y Email — con dictado y triage por IA
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 mt-4">
        {lanes.map((lane) => (
          <Link
            key={lane.label}
            href={lane.href}
            className="group flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: `${lane.accent}/12`, color: lane.accent }}
            >
              <lane.icon className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {lane.label}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                {lane.status}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div
        className="mt-8 rounded-xl border p-6"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          Bandeja legacy de Community Manager
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
          Por ahora el inbox multicanal vive en la vista clásica. Estamos migrando gradualmente a esta consola unificada.
        </p>
        <Link
          href="/inbox"
          className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'oklch(70% 0.14 250)', color: 'white' }}
        >
          Abrir bandeja actual
        </Link>
      </div>
    </main>
  );
}
