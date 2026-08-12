"use client";

import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { brandLabel, isBrandFallback, type InboxBrand } from "@/lib/inbox/brand-display";

interface BrandTagProps {
  brandId: string | null | undefined;
  brandsById: Map<string, InboxBrand>;
  compact?: boolean;
  className?: string;
}

/**
 * Etiqueta de marca para canales, conversaciones y encabezado del chat.
 *
 * La marca se resuelve **siempre por `brand_id`**, nunca por el nombre del
 * canal. Cuando no hay nombre disponible, se muestra el aviso y el id corto en
 * vez de omitir la marca: así el operador sabe que existe y puede reportarla.
 */
export function BrandTag({ brandId, brandsById, compact = false, className }: BrandTagProps) {
  const label = brandLabel(brandId, brandsById);
  const fallback = isBrandFallback(brandId, brandsById);

  return (
    <span
      data-testid="brand-tag"
      data-brand-id={brandId || ""}
      title={`Marca: ${label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        fallback
          ? "border-[#484f58]/30 bg-[#484f58]/10 text-[#8b949e]"
          : "border-[#8b5cf6]/25 bg-[#8b5cf6]/15 text-[#c4b5fd]",
        className,
      )}
    >
      <Building2 className="h-3 w-3 shrink-0" />
      {!compact && <span className="truncate max-w-[140px]">{label}</span>}
    </span>
  );
}
