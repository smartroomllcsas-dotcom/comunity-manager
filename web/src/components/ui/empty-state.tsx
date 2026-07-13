import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Tamaño compacto para columnas laterales / paneles estrechos. */
  size?: "sm" | "md";
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  const iconSize = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconBox = size === "sm" ? "h-12 w-12" : "h-16 w-16";
  const titleSize = size === "sm" ? "text-sm" : "text-base";
  const descSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div
      role="status"
      className={cn(
        "flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-3 p-6 text-center",
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            iconBox,
            "flex items-center justify-center rounded-full border border-border/60 bg-[var(--surface-elevated)] text-muted-foreground"
          )}
        >
          <Icon className={iconSize} aria-hidden="true" />
        </div>
      )}
      <div className="space-y-1">
        <h3 className={cn(titleSize, "font-semibold text-foreground")}>{title}</h3>
        {description && (
          <p className={cn(descSize, "max-w-sm text-muted-foreground")}>{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
