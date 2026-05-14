"use client";
import type { Broadcast } from "@/types/database";

export function BroadcastMetrics({ broadcast }: { broadcast: Broadcast }) {
  const total = broadcast.sent_count || 1;
  const metrics = [
    { label: "Enviados", value: broadcast.sent_count, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
    { label: "Entregados", value: broadcast.delivered_count, pct: ((broadcast.delivered_count / total) * 100).toFixed(0), color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
    { label: "Leidos", value: broadcast.read_count, pct: ((broadcast.read_count / total) * 100).toFixed(0), color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
    { label: "Fallidos", value: broadcast.failed_count, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div key={m.label} className={`${m.bg} border ${m.border} rounded-lg p-3 text-center`}>
          <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          <p className="text-xs text-[#8b949e]">{m.label} {"pct" in m && m.value > 0 ? `(${m.pct}%)` : ""}</p>
        </div>
      ))}
    </div>
  );
}
