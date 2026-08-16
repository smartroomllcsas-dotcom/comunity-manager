'use client';

import { useEffect, useState } from 'react';
import type { Agent } from '@/lib/os/schemas/agent';
import type { AgentRun } from '@/lib/os/schemas/agent-run';
import { ConductorPanel } from './ConductorPanel';
import { ConstitutionEditor } from './ConstitutionEditor';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface AgentDetailPanelProps {
  agent: Agent;
  initialRuns?: AgentRun[];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function TrustBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.8
      ? 'var(--accent)'
      : score >= 0.5
        ? 'var(--yellow, #eab308)'
        : 'var(--err, #ef4444)';
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 rounded-full bg-os-surface2"
        style={{ height: 6, overflow: 'hidden' }}
      >
        <div
          style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 9999 }}
        />
      </div>
      <span className="num font-mono text-[11px]" style={{ color }}>
        {score.toFixed(2)}
      </span>
    </div>
  );
}

export function AgentDetailPanel({ agent: initialAgent, initialRuns = [] }: AgentDetailPanelProps) {
  const [agent, setAgent] = useState<Agent>(initialAgent);
  const [runs, setRuns] = useState<AgentRun[]>(initialRuns);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const tts = useTextToSpeech();

  // Fetch latest runs from API
  useEffect(() => {
    setLoadingRuns(true);
    fetch(`/api/os/agent-runs?agentId=${agent.id}&limit=20`)
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then((data: AgentRun[]) => {
        if (Array.isArray(data)) setRuns(data);
      })
      .catch(() => {/* use initialRuns */})
      .finally(() => setLoadingRuns(false));
  }, [agent.id]);

  return (
    <div className="flex flex-col gap-4">
      {/* Agent header */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">{agent.name}</div>
            <div className="panel-meta">
              {agent.role || agent.tier} · {agent.model || 'sonnet'}
            </div>
          </div>
          <div className={`agent-status ${agent.status === 'active' ? 'on' : 'idle'}`}>
            {agent.status === 'active' ? 'Live' : agent.status}
          </div>
        </div>

        {agent.description && (
          <p className="px-4 pb-3 text-[11.5px] text-os-muted">{agent.description}</p>
        )}

        {/* Trust score — prominent */}
        <div className="border-t border-os-border px-4 py-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-os-dim">
            Trust score · {agent.trustLedger.length} runs
          </div>
          <TrustBar score={agent.trustScore} />
        </div>

        {/* Tools */}
        {agent.tools.length > 0 && (
          <div className="border-t border-os-border px-4 py-2">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-os-dim">
              Tools
            </div>
            <div className="flex flex-wrap gap-1">
              {agent.tools.map((t) => (
                <span
                  key={t}
                  className="rounded-sm border border-os-border px-1.5 py-0.5 font-mono text-[9.5px] text-os-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Constitution editor */}
      <ConstitutionEditor agent={agent} onSaved={setAgent} />

      {/* Recent runs */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Recent runs</div>
          <div className="flex items-center gap-2">
            {tts.supported && runs.length > 0 && (() => {
              const lastRun = runs[0];
              const lastText = lastRun?.summary || (lastRun?.ok === true ? 'pass' : lastRun?.ok === false ? 'fail' : null);
              if (!lastText) return null;
              return (
                <button
                  type="button"
                  title="Leer última respuesta en voz alta"
                  aria-label="Leer última respuesta"
                  onClick={() => {
                    if (speaking) {
                      tts.stop();
                      setSpeaking(false);
                    } else {
                      const lang = navigator.language?.startsWith('es') ? 'es-ES' : 'en-US';
                      tts.speak(lastText, { lang });
                      setSpeaking(true);
                      // reset flag after ~5s (no onend on speechSynthesis utterance in all browsers)
                      setTimeout(() => setSpeaking(false), 5000);
                    }
                  }}
                  className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                    speaking
                      ? 'bg-accent/20 text-accent animate-pulse'
                      : 'text-os-dim hover:text-os-muted hover:bg-os-surface2'
                  }`}
                >
                  {/* Speaker SVG icon */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    {speaking
                      ? <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                      : <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    }
                  </svg>
                </button>
              );
            })()}
            <div className="panel-meta">{loadingRuns ? 'loading…' : `${runs.length} shown`}</div>
          </div>
        </div>
        <div className="feed">
          {runs.length === 0 && !loadingRuns && (
            <div className="px-4 py-3 font-mono text-[10.5px] text-os-dim">
              No runs yet for this agent.
            </div>
          )}
          {runs.map((run) => (
            <div key={run.id} className="feed-row">
              <div
                className={`shrink-0 h-2 w-2 rounded-full mt-1`}
                style={{
                  background:
                    run.ok === true
                      ? 'var(--accent)'
                      : run.ok === false
                        ? 'var(--err, #ef4444)'
                        : 'var(--text-dim)',
                }}
              />
              <div className="feed-body min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-os-dim truncate">{run.id}</span>
                  <span className="ml-auto shrink-0 font-mono text-[9.5px] text-os-dim">
                    {formatDate(run.startedAt)}
                  </span>
                </div>
                <div className="text-[11px] text-os-muted truncate">
                  {run.summary || (run.ok === true ? 'pass' : run.ok === false ? 'fail' : 'running')}
                </div>
                {(run.tokensIn != null || run.costUsd != null) && (
                  <div className="font-mono text-[9.5px] text-os-dim">
                    {run.tokensIn != null && `${run.tokensIn}↑ ${run.tokensOut ?? 0}↓ tok`}
                    {run.costUsd != null && ` · $${run.costUsd.toFixed(4)}`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conductor panel (slide-out chat dock) */}
      <ConductorPanel />
    </div>
  );
}
