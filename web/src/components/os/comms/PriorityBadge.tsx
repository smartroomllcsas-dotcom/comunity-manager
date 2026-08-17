import type { CommsThread } from '@/app/api/os/comms/threads/route';

interface PriorityBadgeProps {
  priority: CommsThread['priority'];
}

const LABEL: Record<CommsThread['priority'], string> = {
  urgent: 'Urgente',
  normal: 'Normal',
  low: 'Baja',
};

const CLS: Record<CommsThread['priority'], string> = {
  urgent: 'border-red-500/40 bg-red-500/10 text-red-400',
  normal: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider ${CLS[priority]}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {LABEL[priority]}
    </span>
  );
}
