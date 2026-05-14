"use client";
import Link from "next/link";
import {
  MessageSquare, Users, FileText, Zap, Radio, Building2, CreditCard,
  ChevronRight, Shield, Globe, UsersRound, Tag, GitBranch, ClipboardList, ListChecks
} from "lucide-react";

export const dynamic = "force-dynamic";

const sections = [
  {
    title: "General",
    items: [
      {
        href: "/settings/organization",
        title: "Configuracion de la Organizacion",
        description: "Nombre de la organizacion, logo y preferencias generales",
        icon: Building2,
      },
      {
        href: "/settings/security",
        title: "Seguridad",
        description: "Autenticacion, sesiones activas y registro de actividad",
        icon: Shield,
      },
    ],
  },
  {
    title: "Mensajeria",
    items: [
      {
        href: "/settings/channels",
        title: "Canales",
        description: "Administra tus canales de mensajeria conectados",
        icon: Radio,
      },
      {
        href: "/settings/whatsapp",
        title: "WhatsApp",
        description: "Conecta tu numero de WhatsApp y configura el webhook",
        icon: MessageSquare,
      },
      {
        href: "/settings/templates",
        title: "Plantillas",
        description: "Sincroniza y gestiona templates de WhatsApp Business",
        icon: FileText,
      },
      {
        href: "/settings/quick-replies",
        title: "Respuestas Rapidas",
        description: "Crea atajos de respuestas frecuentes para tu equipo",
        icon: Zap,
      },
    ],
  },
  {
    title: "Equipo",
    items: [
      {
        href: "/settings/agents",
        title: "Equipo / Agentes",
        description: "Invita miembros, gestiona roles y permisos del equipo",
        icon: Users,
      },
      {
        href: "/settings/teams",
        title: "Equipos",
        description: "Organiza tu equipo en grupos de trabajo",
        icon: UsersRound,
      },
    ],
  },
  {
    title: "Contactos",
    items: [
      {
        href: "/settings/tags",
        title: "Etiquetas",
        description: "Gestiona las etiquetas para clasificar tus contactos",
        icon: Tag,
      },
      {
        href: "/settings/lifecycle",
        title: "Ciclo de Vida",
        description: "Define las etapas del ciclo de vida de tus contactos",
        icon: GitBranch,
      },
      {
        href: "/settings/closing-notes",
        title: "Notas de Cierre",
        description: "Categorias para clasificar notas al cerrar conversaciones",
        icon: ClipboardList,
      },
      {
        href: "/settings/contact-fields",
        title: "Campos de Contacto",
        description: "Define campos personalizados para almacenar informacion de contactos",
        icon: ListChecks,
      },
    ],
  },
  {
    title: "Cuenta",
    items: [
      {
        href: "/settings/billing",
        title: "Facturacion y Uso",
        description: "Plan actual, uso de MACs y gestion de suscripcion",
        icon: CreditCard,
      },
      {
        href: "/settings/api",
        title: "API e Integraciones",
        description: "Claves API, webhooks y conectores de terceros",
        icon: Globe,
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-full bg-[#0d1117] p-6">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-white mb-1">Configuración</h1>
        <p className="text-sm text-[#8b949e] mb-8">Administra la configuracion de tu organizacion</p>

        <div className="space-y-8">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-3">
                {section.title}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-4 hover:border-[#3d444d] hover:bg-[#1e2536] transition-all group cursor-pointer h-full flex flex-col">
                      <div className="flex items-start justify-between mb-3">
                        <div className="h-10 w-10 rounded-lg bg-[#0d1117] border border-[#2d333b] flex items-center justify-center">
                          <item.icon className="h-5 w-5 text-blue-400" />
                        </div>
                        <ChevronRight className="h-4 w-4 text-[#2d333b] group-hover:text-[#8b949e] transition-colors" />
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                      <p className="text-xs text-[#8b949e] leading-relaxed flex-1">{item.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
