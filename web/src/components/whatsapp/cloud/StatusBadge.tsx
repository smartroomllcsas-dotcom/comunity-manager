"use client";
import type { WaTemplateStatus, WaTemplateQuality } from "@/lib/whatsapp/cloud/types";

const STATUS_MAP: Record<WaTemplateStatus, { label: string; className: string }> = {
  APPROVED:         { label: "Aprobado",       className: "bg-green-500/15 text-green-400 border-green-500/30" },
  PENDING:          { label: "Pendiente",      className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  REJECTED:         { label: "Rechazado",      className: "bg-red-500/15 text-red-400 border-red-500/30" },
  PAUSED:           { label: "Pausado",        className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  DISABLED:         { label: "Deshabilitado",  className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  IN_APPEAL:        { label: "En apelación",   className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  PENDING_DELETION: { label: "Eliminando",     className: "bg-red-500/15 text-red-300 border-red-500/30" },
};

const QUALITY_MAP: Record<WaTemplateQuality, { label: string; className: string }> = {
  GREEN:   { label: "Alta calidad",   className: "bg-green-500/15 text-green-400 border-green-500/30" },
  YELLOW:  { label: "Calidad media",  className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  RED:     { label: "Calidad baja",   className: "bg-red-500/15 text-red-400 border-red-500/30" },
  UNKNOWN: { label: "Sin datos",      className: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
};

export function StatusBadge({ status }: { status: WaTemplateStatus }) {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export function QualityBadge({ quality }: { quality: WaTemplateQuality }) {
  const cfg = QUALITY_MAP[quality] ?? QUALITY_MAP.UNKNOWN;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
