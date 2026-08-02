'use client'

interface SkillsBadgeProps {
  skills: string[]
}

/**
 * Renders a row of pills showing which skills were invoked to produce
 * the last assistant response. Slugs come from the chat API response
 * (`_skills_used: string[]`) populated by the skills engine (Agente B/C).
 *
 * Silently renders nothing when there are no skills to display.
 */
export default function SkillsBadge({ skills }: SkillsBadgeProps) {
  if (!skills || skills.length === 0) return null

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      aria-label={`Skills used: ${skills.join(', ')}`}
    >
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-300/90"
        aria-hidden="true"
      >
        <span role="img" aria-label="brain">🧠</span>
        Using skills:
      </span>
      {skills.map((slug) => (
        <span
          key={slug}
          className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-200 transition-colors hover:border-violet-400/60 hover:bg-violet-500/20"
        >
          {slug}
        </span>
      ))}
    </div>
  )
}
