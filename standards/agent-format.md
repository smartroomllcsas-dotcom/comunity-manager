# Agent Format Standard

## AGENT.md Frontmatter

---
name: agent-name
description: "What this agent does and trigger phrases"
version: 1.0.0
type: orchestrator|specialist
skills:
  - skill-name-1
  - skill-name-2
---

## Required Sections

1. **Title and intro** — One paragraph explaining the agent's purpose
2. **Skills table** — All assigned skills with "When to Use" column
3. **Workflows** — Named workflows with mode specification (A/B/C)
4. **Output standards** — What the agent's outputs must include
5. **Quality checks** — Checklist before delivering any work

## Workflow Files

Located in agents/{agent-name}/workflows/:
- One markdown file per workflow
- Must specify: default mode, duration, inputs required, step-by-step process, output format
- Must reference specific skills by name

## Agent Communication

- Agents don't talk to each other directly
- The orchestrator coordinates multi-agent work
- Each agent receives: user request + client context
- Each agent returns: structured output to orchestrator
