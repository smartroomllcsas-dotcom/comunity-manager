# Operation Modes

The orchestrator supports three operation modes that determine how the agent interacts with the user during task execution. The mode can be selected per-request or defaulted based on task type.

---

## Mode A: Conversational

The agent asks questions step-by-step. The user directs each decision.

**Flow:**
1. Receive user request
2. Ask clarifying questions one at a time
3. Wait for user response before proceeding
4. Generate content incrementally based on answers
5. User confirms or adjusts at each step
6. Finalize output only after explicit user approval

**Best for:** Creative work, strategy development, new client onboarding, sensitive topics, crisis response.

**Behavior:** The agent never assumes. It validates every decision with the user before moving forward. Output is built collaboratively.

---

## Mode B: Approval-Based

The agent generates a complete proposal. The user approves, edits, or rejects before execution.

**Flow:**
1. Receive user request
2. Load full client context (brand brief, history, preferences)
3. Generate a complete proposal (content calendar, campaign, email draft, etc.)
4. Present the proposal with the prompt: **"Approve / Edit / Reject?"**
5. If **Edit**: user provides feedback, agent revises and re-presents
6. If **Reject**: agent asks what to change fundamentally, starts over
7. If **Approve**: agent executes (publishes, schedules, sends, etc.)

**Best for:** Content calendars, ad campaigns, email newsletters, individual posts, any deliverable with a clear output format.

**Behavior:** The agent does the heavy lifting upfront. The user acts as reviewer and decision-maker. Iteration happens on complete drafts, not fragments.

---

## Mode C: Autonomous

The agent executes based on predefined rules and client context. It reports results and flags exceptions.

**Flow:**
1. Trigger fires (scheduled time, event, or automated rule)
2. Load client context and relevant data
3. Execute the full workflow end-to-end
4. Run quality gates (brand voice check, policy compliance, metric thresholds)
5. Deliver a summary report to the user
6. Flag any exceptions or anomalies that need human review

**Best for:** Daily analytics reports, routine engagement tasks, SEO audits, recurring posts, any task with well-defined rules and low risk.

**Behavior:** The agent operates independently within guardrails. The user is informed, not consulted. Exceptions escalate to Mode A or B automatically.

---

## Mode Selection

When the mode is not predetermined, the orchestrator asks:

> **"How do you want me to handle this? (A) Conversational, (B) Approval, (C) Autonomous"**

If the user does not specify, the orchestrator applies the default mode based on the task type.

---

## Default Modes by Task Type

| Task                    | Default Mode | Rationale                                      |
|-------------------------|--------------|-------------------------------------------------|
| New client onboarding   | A            | Requires deep discovery and user input          |
| Content calendar        | B            | Clear deliverable, user reviews before publish  |
| Individual post         | B            | Complete draft for approval                     |
| Brand brief             | A            | Creative and strategic, needs collaboration     |
| Analytics report        | C            | Data-driven, rule-based, low risk               |
| Daily engagement        | C            | Routine, follows established patterns           |
| Ad campaign             | B            | Requires budget approval before execution       |
| SEO audit               | C            | Automated analysis with flagged exceptions      |
| Email newsletter        | B            | Complete draft for review before send           |
| Crisis response         | A            | High stakes, every word matters                 |

---

## Mode Escalation

- If Mode C encounters an anomaly or quality gate failure, it escalates to Mode B (present for approval).
- If Mode B receives a rejection, it can escalate to Mode A (conversational) to better understand the user's intent.
- The user can override the mode at any time by saying "switch to mode A/B/C" or equivalent.
