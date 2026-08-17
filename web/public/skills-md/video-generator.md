---
name: video-generator
description: AI video production workflow using Remotion. Use for promotional videos, product demos, motion graphics, and short-form social videos built programmatically in React/Remotion.
---

# Video Generator (Remotion)

Build polished motion graphics videos with React + Remotion.

## Required Workflow

1. Create or update project in `output/<project-name>/`.
2. Build scene-based Remotion composition with continuity and varied pacing.
3. Ensure dependencies are installed with `npm install`.
4. Ensure scripts use `npx remotion`:

```json
"scripts": {
  "dev": "npx remotion studio",
  "build": "npx remotion bundle"
}
```

5. Start Remotion preview (`npm run dev`) and wait for readiness on port `3000`.
6. Start tunnel (`bash scripts/tunnel.sh start 3000`) and share URL.
7. Iterate from user feedback with live hot-reload.
8. Render only when user explicitly requests export.

## Motion Graphics Rules

Always:
- Favor layered compositions, overlap, continuity, and custom transitions.
- Use Lucide React icons (`npm install lucide-react`).
- Keep typography brief and readable for time-based media.

Never:
- Fade-to-black slideshow transitions between every scene.
- Use emoji as icons.
- Use static, center-only text on plain backgrounds for the whole video.

## Scene Architecture

- Keep a persistent visual layer outside scene `Sequence`s when continuity helps.
- Mix scene durations (roughly 2-5 seconds) for rhythm.
- Use spring/interpolate timing, not purely linear motion everywhere.

## References

Load only when needed:
- Components: `references/components.md`
- Composition patterns: `references/composition-patterns.md`

## Helper Scripts

- Remotion wrapper: `scripts/remotion.sh`

## Render (On Explicit User Request)

```bash
cd output/<project-name>
npx remotion render CompositionName out/video.mp4
```
