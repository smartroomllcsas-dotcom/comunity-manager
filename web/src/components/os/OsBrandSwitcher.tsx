'use client';

/**
 * OsBrandSwitcher — BrandSwitcher para el shell OS.
 *
 * Las páginas OS son RSC (force-dynamic) y resuelven la org server-side vía
 * identify() → cookie cm_active_brand_id. Al cambiar de marca, la cookie ya
 * quedó escrita por el provider, pero los RSC no se re-renderizan solos:
 * router.refresh() fuerza el re-fetch con la nueva marca.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BrandSwitcher } from '@/components/brand/BrandSwitcher';
import { useActiveBrand } from '@/hooks/useActiveBrand';

export function OsBrandSwitcher() {
  const router = useRouter();
  const { activeClientId } = useActiveBrand();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!activeClientId) return;
    if (prev.current === null) {
      // Primera resolución (hidratación) — no refrescar.
      prev.current = activeClientId;
      return;
    }
    if (activeClientId !== prev.current) {
      prev.current = activeClientId;
      router.refresh();
    }
  }, [activeClientId, router]);

  return <BrandSwitcher />;
}
