import type { Agent, Activity, Connector, Goal } from '@/lib/os/repository';
import { PulseCards } from './PulseCards';
import { ActivityFeed } from './ActivityFeed';
import { AgentRoster } from './AgentRoster';
import { ConnectionsStrip } from './ConnectionsStrip';
import { GoalsGrid } from './GoalsGrid';

interface ConsoleHomeProps {
  agents: Agent[];
  activity: Activity[];
  connectors: Connector[];
  goals: Goal[];
  orgName?: string | null;
}

export function ConsoleHome({ agents, activity, connectors, goals, orgName }: ConsoleHomeProps) {
  return (
    <>
      <PulseCards agents={agents} connectors={connectors} goals={goals} />

      <section className="split">
        <ActivityFeed activity={activity} />
        <AgentRoster agents={agents} />
      </section>

      <ConnectionsStrip connectors={connectors} />

      <GoalsGrid goals={goals} />

      <div className="footbar">
        <span><kbd>⌘K</kbd> command</span>
        <span><kbd>g</kbd> <kbd>a</kbd> agents</span>
        <span><kbd>g</kbd> <kbd>g</kbd> goals</span>
        <div className="right">
          <span>org: <strong>{orgName ?? '—'}</strong></span>
          <span>Community OS ✓</span>
          <span>región: cle1</span>
        </div>
      </div>
    </>
  );
}
