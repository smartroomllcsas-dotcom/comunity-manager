# Skill Format Standard

All skills in this platform use this YAML frontmatter format:

## Frontmatter

---
name: skill-name
description: "Trigger phrases and purpose description"
version: 1.0.0
agent: assigned-agent-name
sources:
  - source-repo-name
metadata:
  category: content|brand|seo|ads|email|cro|growth|analytics|community|productivity
  modes: [quick, standard, deep]
  language: multi
---

## Rules

- `name` must match the directory name exactly
- `description` must include trigger phrases for intent detection
- `agent` indicates which agent uses this skill
- `sources` lists which original repo(s) the skill came from
- `modes` lists supported execution modes (not all skills support all 3)
- All skills must load client context from `.clients/{slug}/context.md` if available
- Skills under 500 lines, move details to `references/` subdirectory
- Use H2 for sections, H3 for subsections
- Bullet points and numbered lists preferred
- Bold for key terms, code blocks for examples
- Direct, instructional tone (second person)

## Directory Structure

skill-name/
├── SKILL.md           # Required - main instructions
├── references/        # Optional - detailed knowledge bases
├── scripts/           # Optional - Python/Node.js tools
├── templates/         # Optional - user-facing templates
└── assets/            # Optional - images, sample data

## Context Loading

Every skill should check for client context before starting:
1. Check if `.clients/{slug}/context.md` exists
2. If yes, load brand voice, audience, positioning
3. If no, ask for the information needed
