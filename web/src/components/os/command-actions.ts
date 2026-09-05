export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  keywords?: readonly string[];
  section: 'nav' | 'action' | 'search';
  shortcut?: string[];
  href?: string;
  onRun?: () => void | Promise<void>;
}

const OS_ROUTES = [
  { id: 'nav:console',      label: 'Ir a Console',        href: '/es/os',               keywords: ['home', 'inicio', 'dashboard'] },
  { id: 'nav:agents',       label: 'Ir a Agents',         href: '/es/os/agents',        keywords: ['agentes', 'roster', 'ia'] },
  { id: 'nav:goals',        label: 'Ir a Goals',          href: '/es/os/goals',         keywords: ['metas', 'sentinel'] },
  { id: 'nav:skills',       label: 'Ir a Skills',         href: '/es/os/skills',        keywords: ['habilidades'] },
  { id: 'nav:funnel',       label: 'Ir a Funnel',         href: '/es/os/funnel',        keywords: ['pipeline', 'leads'] },
  { id: 'nav:content',      label: 'Ir a Content',        href: '/es/os/content',       keywords: ['contenido', 'posts'] },
  { id: 'nav:social',       label: 'Ir a Social',         href: '/es/os/social',        keywords: ['audiencia', 'followers'] },
  { id: 'nav:workflows',    label: 'Ir a Workflows',      href: '/es/os/workflows',     keywords: ['automation'] },
  { id: 'nav:integrations', label: 'Ir a Integrations',   href: '/es/os/integrations',  keywords: ['conexiones', 'canales'] },
] as const;

export function getDefaultActions(): CommandAction[] {
  return OS_ROUTES.map(r => ({ ...r, section: 'nav' as const }));
}
