'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AgentTemplate } from '@/lib/os/schemas/agent-template';

interface MarketplaceGridProps {
  templates: AgentTemplate[];
}

export function MarketplaceGrid({ templates }: MarketplaceGridProps) {
  const t = useTranslations('os.marketplace');
  const [installing, setInstalling] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  const categories = Array.from(new Set(templates.map(t => t.category))).sort();

  async function handleInstall(templateId: string) {
    if (installing) return;
    setInstalling(templateId);
    try {
      const res = await fetch(`/api/os/marketplace/${templateId}/install`, {
        method: 'POST',
      });
      if (res.ok) {
        setInstalled(prev => new Set(prev).add(templateId));
      }
    } finally {
      setInstalling(null);
    }
  }

  return (
    <div>
      {/* Category chips */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginBottom: 'var(--sp-4)' }}>
        {categories.map(cat => (
          <span key={cat} className="badge badge-muted" style={{ textTransform: 'capitalize' }}>
            {cat}
          </span>
        ))}
      </div>

      {/* Cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 'var(--sp-4)',
        }}
      >
        {templates.map(tpl => (
          <div key={tpl.id} className="panel">
            <div className="panel-head">
              <div className="panel-title">{tpl.name}</div>
              {tpl.featured && (
                <span className="badge badge-accent" style={{ fontSize: 10 }}>Featured</span>
              )}
            </div>
            <div className="px-4 py-3 text-[12px] text-os-muted space-y-2" style={{ flex: 1 }}>
              <p>{tpl.description}</p>
              <p style={{ color: 'var(--os-text-3)' }}>
                {tpl.installsCount} installs · {tpl.tier} · {tpl.category}
              </p>
            </div>
            <div className="px-4 pb-4">
              <button
                className={`btn btn-sm w-full${installed.has(tpl.id) ? ' btn-ghost' : ''}`}
                disabled={!!installing || installed.has(tpl.id)}
                onClick={() => handleInstall(tpl.id)}
              >
                {installed.has(tpl.id)
                  ? t('installed')
                  : installing === tpl.id
                  ? '…'
                  : t('install')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
