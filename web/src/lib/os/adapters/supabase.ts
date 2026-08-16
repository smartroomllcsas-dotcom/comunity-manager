import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OSRepository } from '../repository';
import { AgentSchema, type Agent } from '../schemas/agent';
import { GoalSchema, type Goal } from '../schemas/goal';
import { SkillSchema, type Skill } from '../schemas/skill';
import { WorkflowSchema, type Workflow } from '../schemas/workflow';
import { AgentRunSchema, type AgentRun, type NewAgentRun } from '../schemas/agent-run';
import { ConnectorSchema, type Connector, type ConnectorStatus } from '../schemas/connector';
import { ActivitySchema, type Activity, type NewActivity } from '../schemas/activity';
import { KnowledgeNodeSchema, type KnowledgeNode, type NewKnowledgeNode, type NodeKind } from '../schemas/knowledge-node';
import { KnowledgeEdgeSchema, type KnowledgeEdge, type NewKnowledgeEdge } from '../schemas/knowledge-edge';
import { AgentTemplateSchema, type AgentTemplate } from '../schemas/agent-template';

// ─── Error ───────────────────────────────────────────────────────────────────

export class RepoError extends Error {
  constructor(public op: string, public override cause: unknown) {
    super(`repo:${op} failed`);
    this.name = 'RepoError';
  }
}

// ─── Agent mappers ────────────────────────────────────────────────────────────

function rowToAgent(r: Record<string, unknown>): Agent {
  return AgentSchema.parse({
    id: r.id,
    orgId: r.org_id,
    departmentId: r.department_id,
    name: r.name,
    role: r.role,
    status: r.status,
    tier: r.tier,
    description: r.description,
    model: r.model,
    tools: r.tools,
    parentId: r.parent_id ?? null,
    instance: r.instance,
    constitution: r.constitution,
    trustScore: Number(r.trust_score),
    trustLedger: r.trust_ledger,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

function agentToRow(orgId: string, a: Agent) {
  return {
    id: a.id,
    org_id: orgId,
    department_id: a.departmentId,
    name: a.name,
    role: a.role,
    status: a.status,
    tier: a.tier,
    description: a.description,
    model: a.model,
    tools: a.tools,
    parent_id: a.parentId ?? null,
    instance: a.instance,
    constitution: a.constitution,
    trust_score: a.trustScore,
    trust_ledger: a.trustLedger,
  };
}

// ─── Goal mappers ─────────────────────────────────────────────────────────────

function rowToGoal(r: Record<string, unknown>): Goal {
  return GoalSchema.parse({
    id: r.id,
    orgId: r.org_id,
    title: r.title,
    spec: r.spec,
    ownerAgentId: r.owner_agent_id ?? null,
    cadence: r.cadence,
    lastCheckedAt: r.last_checked_at ?? null,
    lastStatus: r.last_status ?? null,
    lastEvidence: r.last_evidence ?? null,
    createdAt: r.created_at,
  });
}

function goalToRow(orgId: string, g: Goal) {
  return {
    id: g.id,
    org_id: orgId,
    title: g.title,
    spec: g.spec,
    owner_agent_id: g.ownerAgentId ?? null,
    cadence: g.cadence,
    last_checked_at: g.lastCheckedAt ?? null,
    last_status: g.lastStatus ?? null,
    last_evidence: g.lastEvidence ?? null,
  };
}

// ─── Skill mappers ────────────────────────────────────────────────────────────

function rowToSkill(r: Record<string, unknown>): Skill {
  return SkillSchema.parse({
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    category: r.category,
    description: r.description,
    ownerAgentId: r.owner_agent_id ?? null,
    status: r.status,
    tools: r.tools,
    markdown: r.markdown,
    schedule: r.schedule ?? null,
    ord: r.ord,
  });
}

function skillToRow(orgId: string, s: Skill) {
  return {
    id: s.id,
    org_id: orgId,
    name: s.name,
    category: s.category,
    description: s.description,
    owner_agent_id: s.ownerAgentId ?? null,
    status: s.status,
    tools: s.tools,
    markdown: s.markdown,
    schedule: s.schedule ?? null,
    ord: s.ord,
  };
}

// ─── Workflow mappers ─────────────────────────────────────────────────────────

function rowToWorkflow(r: Record<string, unknown>): Workflow {
  return WorkflowSchema.parse({
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    subtitle: r.subtitle,
    revenueUsd: r.revenue_usd,
    ord: r.ord,
    steps: r.steps,
    createdAt: r.created_at,
  });
}

function workflowToRow(orgId: string, w: Workflow) {
  return {
    id: w.id,
    org_id: orgId,
    name: w.name,
    subtitle: w.subtitle,
    revenue_usd: w.revenueUsd,
    ord: w.ord,
    steps: w.steps,
  };
}

// ─── AgentRun mappers ─────────────────────────────────────────────────────────

function rowToRun(r: Record<string, unknown>): AgentRun {
  return AgentRunSchema.parse({
    id: r.id,
    orgId: r.org_id,
    agentId: r.agent_id,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? null,
    ok: r.ok ?? null,
    summary: r.summary,
    input: r.input ?? null,
    output: r.output ?? null,
    tokensIn: r.tokens_in ?? null,
    tokensOut: r.tokens_out ?? null,
    costUsd: r.cost_usd != null ? Number(r.cost_usd) : null,
  });
}

function runToRow(orgId: string, run: NewAgentRun) {
  return {
    org_id: orgId,
    agent_id: run.agentId,
    started_at: run.startedAt,
    finished_at: run.finishedAt ?? null,
    ok: run.ok ?? null,
    summary: run.summary ?? '',
    input: run.input ?? null,
    output: run.output ?? null,
    tokens_in: run.tokensIn ?? null,
    tokens_out: run.tokensOut ?? null,
    cost_usd: run.costUsd ?? null,
  };
}

// ─── Connector mappers ────────────────────────────────────────────────────────

function rowToConnector(r: Record<string, unknown>): Connector {
  return ConnectorSchema.parse({
    id: r.id,
    orgId: r.org_id,
    kind: r.kind,
    provider: r.provider,
    status: r.status,
    lastCheckAt: r.last_check_at ?? null,
    lastError: r.last_error ?? null,
    config: r.config,
    secretRef: r.secret_ref ?? null,
  });
}

// ─── Activity mappers ─────────────────────────────────────────────────────────

function rowToActivity(r: Record<string, unknown>): Activity {
  return ActivitySchema.parse({
    id: r.id,
    orgId: r.org_id,
    kind: r.kind,
    actorId: r.actor_id ?? null,
    at: r.at,
    summary: r.summary,
    payload: r.payload,
    ok: r.ok ?? null,
  });
}

function activityToRow(orgId: string, a: NewActivity) {
  return {
    org_id: orgId,
    kind: a.kind,
    actor_id: a.actorId ?? null,
    at: a.at ?? new Date().toISOString(),
    summary: a.summary ?? '',
    payload: a.payload ?? {},
    ok: a.ok ?? null,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSupabaseRepository(sb: SupabaseClient): OSRepository {
  return {
    // ── AGENTS ──────────────────────────────────────────────────────────────
    agents: {
      async all(orgId) {
        const { data, error } = await sb
          .from('os_agents')
          .select('*')
          .eq('org_id', orgId)
          .order('tier')
          .order('name');
        if (error) throw new RepoError('agents.all', error);
        return z.array(AgentSchema).parse((data ?? []).map(rowToAgent));
      },
      async byId(orgId, id) {
        const { data, error } = await sb
          .from('os_agents')
          .select('*')
          .eq('org_id', orgId)
          .eq('id', id)
          .maybeSingle();
        if (error) throw new RepoError('agents.byId', error);
        return data ? rowToAgent(data as Record<string, unknown>) : null;
      },
      async byDepartment(orgId, depId) {
        const { data, error } = await sb
          .from('os_agents')
          .select('*')
          .eq('org_id', orgId)
          .eq('department_id', depId);
        if (error) throw new RepoError('agents.byDepartment', error);
        return (data ?? []).map(rowToAgent);
      },
      async upsert(orgId, a) {
        const { error } = await sb
          .from('os_agents')
          .upsert(agentToRow(orgId, a));
        if (error) throw new RepoError('agents.upsert', error);
      },
      async delete(orgId, id) {
        const { error } = await sb
          .from('os_agents')
          .delete()
          .eq('org_id', orgId)
          .eq('id', id);
        if (error) throw new RepoError('agents.delete', error);
      },
    },

    // ── GOALS ───────────────────────────────────────────────────────────────
    goals: {
      async all(orgId) {
        const { data, error } = await sb
          .from('os_goals')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false });
        if (error) throw new RepoError('goals.all', error);
        return (data ?? []).map(rowToGoal);
      },
      async byId(orgId, id) {
        const { data, error } = await sb
          .from('os_goals')
          .select('*')
          .eq('org_id', orgId)
          .eq('id', id)
          .maybeSingle();
        if (error) throw new RepoError('goals.byId', error);
        return data ? rowToGoal(data as Record<string, unknown>) : null;
      },
      async upsert(orgId, g) {
        const { error } = await sb
          .from('os_goals')
          .upsert(goalToRow(orgId, g));
        if (error) throw new RepoError('goals.upsert', error);
      },
      async markVerified(orgId, id, at, ok, evidence) {
        const { error } = await sb
          .from('os_goals')
          .update({
            last_checked_at: at.toISOString(),
            last_status: ok ? 'ok' : 'breach',
            last_evidence: evidence,
          })
          .eq('org_id', orgId)
          .eq('id', id);
        if (error) throw new RepoError('goals.markVerified', error);
      },
    },

    // ── SKILLS ──────────────────────────────────────────────────────────────
    skills: {
      async all(orgId) {
        const { data, error } = await sb
          .from('os_skills')
          .select('*')
          .eq('org_id', orgId)
          .order('ord');
        if (error) throw new RepoError('skills.all', error);
        return (data ?? []).map(rowToSkill);
      },
      async byId(orgId, id) {
        const { data, error } = await sb
          .from('os_skills')
          .select('*')
          .eq('org_id', orgId)
          .eq('id', id)
          .maybeSingle();
        if (error) throw new RepoError('skills.byId', error);
        return data ? rowToSkill(data as Record<string, unknown>) : null;
      },
      async upsert(orgId, s) {
        const { error } = await sb
          .from('os_skills')
          .upsert(skillToRow(orgId, s));
        if (error) throw new RepoError('skills.upsert', error);
      },
      async schedule(orgId, id, cron) {
        const { error } = await sb
          .from('os_skills')
          .update({ schedule: cron })
          .eq('org_id', orgId)
          .eq('id', id);
        if (error) throw new RepoError('skills.schedule', error);
      },
    },

    // ── WORKFLOWS ────────────────────────────────────────────────────────────
    workflows: {
      async all(orgId) {
        const { data, error } = await sb
          .from('os_workflows')
          .select('*')
          .eq('org_id', orgId)
          .order('ord');
        if (error) throw new RepoError('workflows.all', error);
        return (data ?? []).map(rowToWorkflow);
      },
      async byId(orgId, id) {
        const { data, error } = await sb
          .from('os_workflows')
          .select('*')
          .eq('org_id', orgId)
          .eq('id', id)
          .maybeSingle();
        if (error) throw new RepoError('workflows.byId', error);
        return data ? rowToWorkflow(data as Record<string, unknown>) : null;
      },
      async upsert(orgId, w) {
        const { error } = await sb
          .from('os_workflows')
          .upsert(workflowToRow(orgId, w));
        if (error) throw new RepoError('workflows.upsert', error);
      },
    },

    // ── AGENT RUNS ───────────────────────────────────────────────────────────
    agentRuns: {
      async byAgent(orgId, agentId, limit = 50) {
        const { data, error } = await sb
          .from('os_agent_runs')
          .select('*')
          .eq('org_id', orgId)
          .eq('agent_id', agentId)
          .order('started_at', { ascending: false })
          .limit(limit);
        if (error) throw new RepoError('agentRuns.byAgent', error);
        return (data ?? []).map(rowToRun);
      },
      async recent(orgId, limit = 20) {
        const { data, error } = await sb
          .from('os_agent_runs')
          .select('*')
          .eq('org_id', orgId)
          .order('started_at', { ascending: false })
          .limit(limit);
        if (error) throw new RepoError('agentRuns.recent', error);
        return (data ?? []).map(rowToRun);
      },
      async insert(orgId, run) {
        const { data, error } = await sb
          .from('os_agent_runs')
          .insert(runToRow(orgId, run))
          .select()
          .single();
        if (error) throw new RepoError('agentRuns.insert', error);
        return rowToRun(data as Record<string, unknown>);
      },
    },

    // ── CONNECTORS ───────────────────────────────────────────────────────────
    connectors: {
      async all(orgId) {
        const { data, error } = await sb
          .from('os_connectors')
          .select('*')
          .eq('org_id', orgId);
        if (error) throw new RepoError('connectors.all', error);
        return (data ?? []).map(rowToConnector);
      },
      async byId(orgId, id) {
        const { data, error } = await sb
          .from('os_connectors')
          .select('*')
          .eq('org_id', orgId)
          .eq('id', id)
          .maybeSingle();
        if (error) throw new RepoError('connectors.byId', error);
        return data ? rowToConnector(data as Record<string, unknown>) : null;
      },
      async setStatus(orgId, id, status: ConnectorStatus, meta?: unknown) {
        const update: Record<string, unknown> = {
          status,
          last_check_at: new Date().toISOString(),
        };
        if (status === 'error' && typeof meta === 'string') {
          update.last_error = meta;
        }
        const { error } = await sb
          .from('os_connectors')
          .update(update)
          .eq('org_id', orgId)
          .eq('id', id);
        if (error) throw new RepoError('connectors.setStatus', error);
      },
    },

    // ── ACTIVITY ─────────────────────────────────────────────────────────────
    activity: {
      async recent(orgId, limit = 50) {
        // Prefer enriched view (avoids N+1 with agent names)
        // Fallback to base table if view doesn't exist
        const table = 'os_activity_enriched';
        const { data, error } = await sb
          .from(table)
          .select('*')
          .eq('org_id', orgId)
          .order('at', { ascending: false })
          .limit(limit);

        if (error) {
          // Fallback to base table
          const fallback = await sb
            .from('os_activity')
            .select('*')
            .eq('org_id', orgId)
            .order('at', { ascending: false })
            .limit(limit);
          if (fallback.error) throw new RepoError('activity.recent', fallback.error);
          return (fallback.data ?? []).map(rowToActivity);
        }
        return (data ?? []).map(rowToActivity);
      },
      async insert(orgId, a) {
        const { data, error } = await sb
          .from('os_activity')
          .insert(activityToRow(orgId, a))
          .select()
          .single();
        if (error) throw new RepoError('activity.insert', error);
        return rowToActivity(data as Record<string, unknown>);
      },
      subscribe(orgId, cb) {
        const channel = sb
          .channel('os_activity_channel_' + orgId)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'os_activity',
              filter: `org_id=eq.${orgId}`,
            },
            (payload) => {
              try {
                cb(rowToActivity(payload.new as Record<string, unknown>));
              } catch {
                // swallow parse errors in subscription
              }
            }
          )
          .subscribe();

        return () => { sb.removeChannel(channel); };
      },
    },

    // ── TEMPLATES ────────────────────────────────────────────────────────────
    templates: {
      async all() {
        const { data, error } = await sb
          .from('os_agent_templates')
          .select('*')
          .order('featured', { ascending: false })
          .order('name');
        if (error) throw new RepoError('templates.all', error);
        return (data ?? []).map(rowToTemplate);
      },
      async byId(id) {
        const { data, error } = await sb
          .from('os_agent_templates')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw new RepoError('templates.byId', error);
        return data ? rowToTemplate(data as Record<string, unknown>) : null;
      },
      async byCategory(category) {
        const { data, error } = await sb
          .from('os_agent_templates')
          .select('*')
          .eq('category', category)
          .order('name');
        if (error) throw new RepoError('templates.byCategory', error);
        return (data ?? []).map(rowToTemplate);
      },
      async incrementInstalls(id) {
        const { data } = await sb
          .from('os_agent_templates')
          .select('installs_count')
          .eq('id', id)
          .maybeSingle();
        await sb
          .from('os_agent_templates')
          .update({ installs_count: ((data as Record<string, unknown> | null)?.installs_count as number ?? 0) + 1 })
          .eq('id', id);
      },
    },

    // ── KNOWLEDGE ────────────────────────────────────────────────────────────
    knowledge: {
      nodes: {
        async all(orgId) {
          const { data, error } = await sb
            .from('os_knowledge_nodes')
            .select('*')
            .eq('org_id', orgId)
            .order('weight', { ascending: false });
          if (error) throw new RepoError('knowledge.nodes.all', error);
          return z.array(KnowledgeNodeSchema).parse((data ?? []).map(rowToNode));
        },
        async byKind(orgId, kind) {
          const { data, error } = await sb
            .from('os_knowledge_nodes')
            .select('*')
            .eq('org_id', orgId)
            .eq('kind', kind)
            .order('weight', { ascending: false });
          if (error) throw new RepoError('knowledge.nodes.byKind', error);
          return (data ?? []).map(rowToNode);
        },
        async byId(orgId, id) {
          const { data, error } = await sb
            .from('os_knowledge_nodes')
            .select('*')
            .eq('org_id', orgId)
            .eq('id', id)
            .maybeSingle();
          if (error) throw new RepoError('knowledge.nodes.byId', error);
          return data ? rowToNode(data as Record<string, unknown>) : null;
        },
        async upsert(orgId, node) {
          const { error } = await sb
            .from('os_knowledge_nodes')
            .upsert(nodeToRow(orgId, node));
          if (error) throw new RepoError('knowledge.nodes.upsert', error);
        },
        async touch(orgId, id) {
          const { error } = await sb
            .from('os_knowledge_nodes')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('org_id', orgId)
            .eq('id', id);
          if (error) throw new RepoError('knowledge.nodes.touch', error);
        },
      },
      edges: {
        async forNode(orgId, nodeId) {
          const { data, error } = await sb
            .from('os_knowledge_edges')
            .select('*')
            .eq('org_id', orgId)
            .or(`from_node_id.eq.${nodeId},to_node_id.eq.${nodeId}`);
          if (error) throw new RepoError('knowledge.edges.forNode', error);
          return (data ?? []).map(rowToEdge);
        },
        async insert(orgId, edge) {
          const { error } = await sb
            .from('os_knowledge_edges')
            .insert(edgeToRow(orgId, edge));
          if (error) throw new RepoError('knowledge.edges.insert', error);
        },
        async byRelation(orgId, relation, limit = 50) {
          const { data, error } = await sb
            .from('os_knowledge_edges')
            .select('*')
            .eq('org_id', orgId)
            .eq('relation', relation)
            .order('created_at', { ascending: false })
            .limit(limit);
          if (error) throw new RepoError('knowledge.edges.byRelation', error);
          return (data ?? []).map(rowToEdge);
        },
      },
    },
  };
}

// ─── Knowledge Node mappers ───────────────────────────────────────────────────

function rowToNode(r: Record<string, unknown>): KnowledgeNode {
  return KnowledgeNodeSchema.parse({
    id: r.id,
    orgId: r.org_id,
    kind: r.kind,
    label: r.label,
    summary: r.summary,
    props: r.props,
    source: r.source ?? null,
    sourceId: r.source_id ?? null,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    weight: Number(r.weight),
    vector: r.vector ?? null,
  });
}

function nodeToRow(orgId: string, node: NewKnowledgeNode) {
  return {
    id: node.id,
    org_id: orgId,
    kind: node.kind,
    label: node.label,
    summary: node.summary ?? '',
    props: node.props ?? {},
    source: node.source ?? null,
    source_id: node.sourceId ?? null,
    first_seen_at: node.firstSeenAt ?? new Date().toISOString(),
    last_seen_at: node.lastSeenAt ?? new Date().toISOString(),
    weight: node.weight ?? 1.0,
    vector: node.vector ?? null,
  };
}

// ─── Knowledge Edge mappers ───────────────────────────────────────────────────

function rowToEdge(r: Record<string, unknown>): KnowledgeEdge {
  return KnowledgeEdgeSchema.parse({
    id: r.id,
    orgId: r.org_id,
    fromNodeId: r.from_node_id,
    toNodeId: r.to_node_id,
    relation: r.relation,
    weight: Number(r.weight),
    meta: r.meta,
    createdAt: r.created_at,
  });
}

function edgeToRow(orgId: string, edge: NewKnowledgeEdge) {
  return {
    org_id: orgId,
    from_node_id: edge.fromNodeId,
    to_node_id: edge.toNodeId,
    relation: edge.relation,
    weight: edge.weight ?? 1.0,
    meta: edge.meta ?? {},
    created_at: edge.createdAt ?? new Date().toISOString(),
  };
}

// ─── Agent Template mapper ────────────────────────────────────────────────────

function rowToTemplate(r: Record<string, unknown>): AgentTemplate {
  return AgentTemplateSchema.parse({
    id: r.id,
    publisher: r.publisher ?? 'official',
    name: r.name,
    description: r.description ?? '',
    category: r.category,
    icon: r.icon ?? null,
    tier: r.tier ?? 'worker',
    model: r.model ?? 'claude-sonnet-4-6',
    tools: r.tools ?? [],
    constitution: r.constitution ?? {},
    suggestedSkills: r.suggested_skills ?? [],
    suggestedGoals: r.suggested_goals ?? [],
    installsCount: Number(r.installs_count ?? 0),
    featured: r.featured ?? false,
    createdAt: r.created_at,
  });
}
