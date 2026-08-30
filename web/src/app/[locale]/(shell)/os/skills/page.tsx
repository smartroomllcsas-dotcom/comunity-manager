'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Sparkles, Loader2, FileCode } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Skill = {
  name: string;
  description: string;
  category: string;
  source: string;
};

type ListResp = {
  skills: Skill[];
  count: number;
  cachedAt: string;
  source: string;
  coldReadMs?: number;
  fromCache?: boolean;
  message?: string;
};

type MdResp = {
  markdown: string;
  frontmatter: Record<string, unknown>;
  path: string;
  error?: string;
};

const FEATURED = ['spec-driven-development', 'source-driven-development', 'build', 'review', 'security-review', 'ship'];

const fetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json())?.error || `HTTP ${r.status}`);
    return r.json();
  });

function useColumnCount(): number {
  const [n, setN] = useState(3);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w >= 1536) setN(5);
      else if (w >= 1280) setN(4);
      else if (w >= 768) setN(3);
      else if (w >= 640) setN(2);
      else setN(1);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return n;
}

export default function OsSkillsPage() {
  const { data, error, isLoading } = useSWR<ListResp>('/api/os/skills/list', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60 * 1000,
  });

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('__all__');
  const [openName, setOpenName] = useState<string | null>(null);

  const categories = useMemo(() => {
    if (!data?.skills) return [] as string[];
    const set = new Set<string>();
    for (const s of data.skills) set.add(s.category);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.skills) return [] as Skill[];
    const q = query.trim().toLowerCase();
    return data.skills.filter((s) => {
      if (category !== '__all__' && s.category !== category) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    });
  }, [data, query, category]);

  const featured = useMemo(() => {
    if (!data?.skills) return [] as Skill[];
    const map = new Map(data.skills.map((s) => [s.name, s]));
    return FEATURED.map((n) => map.get(n)).filter(Boolean) as Skill[];
  }, [data]);

  const columns = useColumnCount();
  const rows = Math.ceil(filtered.length / columns);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 128,
    overscan: 6,
  });

  const disabled = data?.source === 'disabled';

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Skills</h1>
          <div className="page-sub">
            {isLoading
              ? 'Cargando índice…'
              : error
                ? `Error: ${(error as Error).message}`
                : `${data?.count.toLocaleString() ?? 0} skills disponibles · fuente: ${data?.source ?? '—'}${
                    data?.coldReadMs ? ` · cold read ${data.coldReadMs}ms` : ''
                  }${data?.fromCache ? ' · cached' : ''}`}
          </div>
        </div>
      </div>

      {/* Featured Spec · Build · Review */}
      {featured.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            <Sparkles className="h-4 w-4" style={{ color: 'var(--os-warn)' }} />
            Spec · Build · Review
          </h2>
          <div className="flex flex-wrap gap-2">
            {featured.map((s) => (
              <button
                key={s.name}
                onClick={() => setOpenName(s.name)}
                className="rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
                title={s.description}
              >
                <code className="font-mono">{s.name}</code>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Controls */}
      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-2)' }} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o descripción…"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v ?? '__all__')}>
          <SelectTrigger className="w-full md:w-64">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-2 text-[12px]" style={{ color: 'var(--text-2)' }}>
        {filtered.length.toLocaleString()} resultados
      </div>

      {/* Empty / disabled */}
      {disabled && (
        <div className="mt-8 rounded-xl border p-6 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <FileCode className="mx-auto mb-2 h-6 w-6" style={{ color: 'var(--text-2)' }} />
          <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Índice de skills deshabilitado
          </div>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-2)' }}>
            {data?.message || 'Configura SKILLS_SOURCE=local en desarrollo o SKILLS_SOURCE=snapshot en producción.'}
          </p>
        </div>
      )}

      {!disabled && !isLoading && !error && filtered.length === 0 && (
        <div className="mt-8 rounded-xl border p-6 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="text-sm" style={{ color: 'var(--text-2)' }}>
            Sin resultados para «{query}»
          </div>
        </div>
      )}

      {/* Virtualized grid */}
      {!disabled && filtered.length > 0 && (
        <div
          ref={parentRef}
          className="mt-4 overflow-auto rounded-xl border"
          style={{ borderColor: 'var(--border)', height: 'calc(100vh - 340px)', minHeight: 400 }}
        >
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((row) => {
              const startIdx = row.index * columns;
              const rowItems = filtered.slice(startIdx, startIdx + columns);
              return (
                <div
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${row.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: 12,
                    padding: '0 12px 12px 12px',
                  }}
                >
                  {rowItems.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setOpenName(s.name)}
                      className="group h-[116px] rounded-xl border p-3 text-left transition-colors hover:bg-white/5"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <code
                          className="line-clamp-1 font-mono text-[12px] font-semibold"
                          style={{ color: 'var(--text-1)' }}
                          title={s.name}
                        >
                          {s.name}
                        </code>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                          style={{ background: 'var(--surface-3, #1f2937)', color: 'var(--text-2)' }}
                        >
                          {s.category}
                        </span>
                      </div>
                      <p
                        className="mt-1.5 text-[11px] leading-snug"
                        style={{
                          color: 'var(--text-2)',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {s.description || <span className="italic opacity-60">Sin descripción</span>}
                      </p>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <SkillDrawer name={openName} onClose={() => setOpenName(null)} />
    </main>
  );
}

function SkillDrawer({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { data, error, isLoading } = useSWR<MdResp>(
    name ? `/api/os/skills/${encodeURIComponent(name)}/md` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 }
  );

  return (
    <Sheet open={!!name} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            <code className="font-mono text-[15px]">{name}</code>
          </SheetTitle>
          {data?.path && (
            <SheetDescription className="text-[10px] break-all font-mono">{data.path}</SheetDescription>
          )}
        </SheetHeader>
        <div className="mt-4 px-4 pb-6">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando SKILL.md…
            </div>
          )}
          {error && (
            <div className="text-sm text-red-400">Error: {(error as Error).message}</div>
          )}
          {data && !error && (
            <article className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.markdown}</ReactMarkdown>
            </article>
          )}
          <div className="mt-6">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
