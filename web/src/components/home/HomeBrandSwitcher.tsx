"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Cambia la empresa activa (misma cookie que usa el resto del CRM) y recarga la Home. */
export function HomeBrandSwitcher({ brands, activeId }: { brands: Array<{ id: string; name: string }>; activeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (brands.length <= 1) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--os-ink-3)]">
      Empresa
      <select
        value={activeId}
        disabled={pending}
        onChange={(e) => {
          document.cookie = `cm_active_brand_id=${encodeURIComponent(e.target.value)}; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`;
          start(() => router.refresh());
        }}
        className="rounded-md border border-[var(--os-line)] bg-[var(--os-paper-2)] px-2 py-1.5 text-sm text-[var(--os-ink)]"
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </label>
  );
}
