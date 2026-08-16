import { getTranslations } from 'next-intl/server';

export default async function OsCommandPage() {
  const t = await getTranslations('os.command');
  return (
    <main className="content">
      <div className="page-head">
        <h1 className="page-title">{t('title')}</h1>
        <p className="page-sub">Presiona <kbd>⌘K</kbd> o <kbd>Ctrl+K</kbd> desde cualquier pantalla para abrir el command palette.</p>
      </div>
      <section className="mt-6 space-y-4 text-sm text-zinc-300">
        <div>
          <h2 className="font-semibold text-zinc-100">Navegación rápida</h2>
          <p>Ir a cualquier ruta del OS: Console, Agents, Goals, Skills, Funnel, Content, Social, Workflows, Integrations.</p>
        </div>
        <div>
          <h2 className="font-semibold text-zinc-100">Atajos</h2>
          <ul className="list-inside list-disc space-y-1 text-zinc-400">
            <li><kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> — abrir/cerrar palette</li>
            <li><kbd>↑</kbd> <kbd>↓</kbd> — navegar resultados</li>
            <li><kbd>↵</kbd> — ejecutar</li>
            <li><kbd>Esc</kbd> — cerrar</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
