import type { OSRepository } from '../repository';
import type { Agent } from '../schemas/agent';
import type { Goal } from '../schemas/goal';
import type { Skill } from '../schemas/skill';
import type { Workflow } from '../schemas/workflow';
import type { AgentRun, NewAgentRun } from '../schemas/agent-run';
import type { Connector, ConnectorStatus } from '../schemas/connector';
import type { Activity, NewActivity } from '../schemas/activity';

// Helper: returns a new nested Map for an org if it doesn't exist
function ensureOrg<T>(store: Map<string, Map<string, T>>, orgId: string): Map<string, T> {
  if (!store.has(orgId)) store.set(orgId, new Map());
  return store.get(orgId)!;
}

let autoId = 1;
function nextId() { return String(autoId++); }
let autoNumId = 1000;
function nextNumId() { return autoNumId++; }

export function createInMemoryRepository(): OSRepository {
  const agents = new Map<string, Map<string, Agent>>();
  const goals = new Map<string, Map<string, Goal>>();
  const skills = new Map<string, Map<string, Skill>>();
  const workflows = new Map<string, Map<string, Workflow>>();
  const agentRuns = new Map<string, Map<string, AgentRun>>();
  const connectors = new Map<string, Map<string, Connector>>();
  const activityStore = new Map<string, Map<string, Activity>>();

  return {
    // ── AGENTS ──────────────────────────────────────────────────────────────
    agents: {
      async all(orgId) {
        return [...(ensureOrg(agents, orgId).values())];
      },
      async byId(orgId, id) {
        return ensureOrg(agents, orgId).get(id) ?? null;
      },
      async byDepartment(orgId, depId) {
        return [...ensureOrg(agents, orgId).values()].filter(a => a.departmentId === depId);
      },
      async upsert(orgId, a) {
        ensureOrg(agents, orgId).set(a.id, { ...a, orgId });
      },
      async delete(orgId, id) {
        ensureOrg(agents, orgId).delete(id);
      },
    },

    // ── GOALS ───────────────────────────────────────────────────────────────
    goals: {
      async all(orgId) {
        return [...(ensureOrg(goals, orgId).values())];
      },
      async byId(orgId, id) {
        return ensureOrg(goals, orgId).get(id) ?? null;
      },
      async upsert(orgId, g) {
        ensureOrg(goals, orgId).set(g.id, { ...g, orgId });
      },
      async markVerified(orgId, id, at, ok, evidence) {
        const store = ensureOrg(goals, orgId);
        const g = store.get(id);
        if (!g) return;
        store.set(id, {
          ...g,
          lastCheckedAt: at.toISOString(),
          lastStatus: ok ? 'ok' : 'breach',
          lastEvidence: evidence,
        });
      },
    },

    // ── SKILLS ──────────────────────────────────────────────────────────────
    skills: {
      async all(orgId) {
        return [...(ensureOrg(skills, orgId).values())].sort((a, b) => a.ord - b.ord);
      },
      async byId(orgId, id) {
        return ensureOrg(skills, orgId).get(id) ?? null;
      },
      async upsert(orgId, s) {
        ensureOrg(skills, orgId).set(s.id, { ...s, orgId });
      },
      async schedule(orgId, id, cron) {
        const store = ensureOrg(skills, orgId);
        const s = store.get(id);
        if (!s) return;
        store.set(id, { ...s, schedule: cron });
      },
    },

    // ── WORKFLOWS ────────────────────────────────────────────────────────────
    workflows: {
      async all(orgId) {
        return [...(ensureOrg(workflows, orgId).values())].sort((a, b) => a.ord - b.ord);
      },
      async byId(orgId, id) {
        return ensureOrg(workflows, orgId).get(id) ?? null;
      },
      async upsert(orgId, w) {
        ensureOrg(workflows, orgId).set(w.id, { ...w, orgId });
      },
    },

    // ── AGENT RUNS ───────────────────────────────────────────────────────────
    agentRuns: {
      async byAgent(orgId, agentId, limit = 50) {
        return [...ensureOrg(agentRuns, orgId).values()]
          .filter(r => r.agentId === agentId)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .slice(0, limit);
      },
      async recent(orgId, limit = 20) {
        return [...ensureOrg(agentRuns, orgId).values()]
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          .slice(0, limit);
      },
      async insert(orgId, run) {
        const id = 'run-' + nextId();
        const stored: AgentRun = { ...run, summary: run.summary ?? '', id, orgId };
        ensureOrg(agentRuns, orgId).set(id, stored);
        return stored;
      },
    },

    // ── CONNECTORS ───────────────────────────────────────────────────────────
    connectors: {
      async all(orgId) {
        return [...(ensureOrg(connectors, orgId).values())];
      },
      async byId(orgId, id) {
        return ensureOrg(connectors, orgId).get(id) ?? null;
      },
      async setStatus(orgId, id, status: ConnectorStatus, meta?: unknown) {
        const store = ensureOrg(connectors, orgId);
        const c = store.get(id);
        if (!c) return;
        store.set(id, {
          ...c,
          status,
          lastCheckAt: new Date().toISOString(),
          lastError: status === 'error' && typeof meta === 'string' ? meta : c.lastError,
        });
      },
    },

    // ── ACTIVITY ─────────────────────────────────────────────────────────────
    activity: {
      async recent(orgId, limit = 50) {
        return [...ensureOrg(activityStore, orgId).values()]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, limit);
      },
      async insert(orgId, a) {
        const id = nextNumId();
        const stored: Activity = {
          id,
          orgId,
          kind: a.kind,
          actorId: a.actorId ?? null,
          at: a.at ?? new Date().toISOString(),
          summary: a.summary ?? '',
          payload: a.payload ?? {},
          ok: a.ok ?? null,
        };
        ensureOrg(activityStore, orgId).set(String(id), stored);
        return stored;
      },
      subscribe(_orgId, _cb) {
        // No-op in memory — no realtime
        return () => {};
      },
    },
  };
}
