import type { Agent } from './schemas/agent';
import type { Goal } from './schemas/goal';
import type { Skill } from './schemas/skill';
import type { Workflow } from './schemas/workflow';
import type { AgentRun, NewAgentRun } from './schemas/agent-run';
import type { Connector } from './schemas/connector';
import type { ConnectorStatus } from './schemas/connector';
import type { Activity, NewActivity } from './schemas/activity';

export type { Agent, Goal, Skill, Workflow, AgentRun, NewAgentRun, Connector, Activity, NewActivity };
export type { NewAgent } from './schemas/agent';
export type { NewGoal } from './schemas/goal';
export type { NewSkill } from './schemas/skill';
export type { NewWorkflow } from './schemas/workflow';
export type { NewConnector } from './schemas/connector';

export type Unsubscribe = () => void;

export interface OSRepository {
  agents: {
    all(orgId: string): Promise<Agent[]>;
    byId(orgId: string, id: string): Promise<Agent | null>;
    byDepartment(orgId: string, depId: string): Promise<Agent[]>;
    upsert(orgId: string, a: Agent): Promise<void>;
    delete(orgId: string, id: string): Promise<void>;
  };
  goals: {
    all(orgId: string): Promise<Goal[]>;
    byId(orgId: string, id: string): Promise<Goal | null>;
    upsert(orgId: string, g: Goal): Promise<void>;
    markVerified(orgId: string, id: string, at: Date, ok: boolean, evidence: unknown): Promise<void>;
  };
  skills: {
    all(orgId: string): Promise<Skill[]>;
    byId(orgId: string, id: string): Promise<Skill | null>;
    upsert(orgId: string, s: Skill): Promise<void>;
    schedule(orgId: string, id: string, cron: string): Promise<void>;
  };
  workflows: {
    all(orgId: string): Promise<Workflow[]>;
    byId(orgId: string, id: string): Promise<Workflow | null>;
    upsert(orgId: string, w: Workflow): Promise<void>;
  };
  agentRuns: {
    byAgent(orgId: string, agentId: string, limit?: number): Promise<AgentRun[]>;
    recent(orgId: string, limit?: number): Promise<AgentRun[]>;
    insert(orgId: string, run: NewAgentRun): Promise<AgentRun>;
  };
  connectors: {
    all(orgId: string): Promise<Connector[]>;
    byId(orgId: string, id: string): Promise<Connector | null>;
    setStatus(orgId: string, id: string, status: ConnectorStatus, meta?: unknown): Promise<void>;
  };
  activity: {
    recent(orgId: string, limit?: number): Promise<Activity[]>;
    insert(orgId: string, a: NewActivity): Promise<Activity>;
    subscribe(orgId: string, cb: (a: Activity) => void): Unsubscribe;
  };
}
