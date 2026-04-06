interface Agent {
  name: string
  role: string
  description: string
  skills: number
  phase: number
  status: 'active' | 'coming-soon'
}

const agents: Agent[] = [
  {
    name: 'Orchestrator',
    role: 'Central Coordinator',
    description: 'Routes requests to specialist agents, manages workflows, and ensures quality across all operations.',
    skills: 8,
    phase: 1,
    status: 'active',
  },
  {
    name: 'Content Writer',
    role: 'Content Creation',
    description: 'Generates platform-native content adapted to each client brand voice and content pillars.',
    skills: 6,
    phase: 1,
    status: 'active',
  },
  {
    name: 'Scheduler',
    role: 'Calendar Management',
    description: 'Manages content calendar, optimizes posting times, and handles scheduling across platforms.',
    skills: 5,
    phase: 1,
    status: 'active',
  },
  {
    name: 'Analyst',
    role: 'Performance Analytics',
    description: 'Tracks engagement metrics, generates reports, and provides data-driven recommendations.',
    skills: 4,
    phase: 1,
    status: 'active',
  },
  {
    name: 'Visual Designer',
    role: 'Image Generation',
    description: 'Creates visual content, image prompts, and maintains brand visual consistency.',
    skills: 5,
    phase: 2,
    status: 'coming-soon',
  },
  {
    name: 'Community Manager',
    role: 'Engagement & DMs',
    description: 'Handles community interactions, responds to comments, and manages direct messages.',
    skills: 4,
    phase: 2,
    status: 'coming-soon',
  },
  {
    name: 'Ad Manager',
    role: 'Paid Campaigns',
    description: 'Creates and optimizes paid advertising campaigns across Meta, Google, and TikTok.',
    skills: 6,
    phase: 2,
    status: 'coming-soon',
  },
  {
    name: 'SEO Specialist',
    role: 'Search Optimization',
    description: 'Optimizes content for search visibility, manages keywords, and tracks rankings.',
    skills: 4,
    phase: 3,
    status: 'coming-soon',
  },
  {
    name: 'Email Marketer',
    role: 'Email Campaigns',
    description: 'Designs email sequences, newsletters, and automated marketing funnels.',
    skills: 5,
    phase: 3,
    status: 'coming-soon',
  },
  {
    name: 'Crisis Handler',
    role: 'Reputation Management',
    description: 'Monitors brand sentiment, handles negative situations, and manages crisis communication.',
    skills: 3,
    phase: 3,
    status: 'coming-soon',
  },
  {
    name: 'Trend Scout',
    role: 'Trend Analysis',
    description: 'Monitors trending topics, hashtags, and viral content opportunities across platforms.',
    skills: 4,
    phase: 3,
    status: 'coming-soon',
  },
]

export default function AgentsPage() {
  const activeCount = agents.filter((a) => a.status === 'active').length
  const totalSkills = agents.reduce((sum, a) => sum + a.skills, 0)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Agents</h1>
        <p className="text-slate-400 mt-1">
          {activeCount} active, {agents.length - activeCount} upcoming | {totalSkills} total skills
        </p>
      </div>

      {/* Phase Overview */}
      <div className="flex gap-4 mb-6">
        {[1, 2, 3].map((phase) => {
          const phaseAgents = agents.filter((a) => a.phase === phase)
          const isActive = phase === 1
          return (
            <div
              key={phase}
              className={`flex-1 rounded-xl p-4 border ${
                isActive
                  ? 'bg-violet-600/10 border-violet-500/30'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={`text-sm font-semibold ${isActive ? 'text-violet-400' : 'text-slate-400'}`}>
                  Phase {phase}
                </p>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-700/50 text-slate-500'
                  }`}
                >
                  {isActive ? 'Active' : 'Planned'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-200 mt-1">{phaseAgents.length}</p>
              <p className="text-xs text-slate-500">agents</p>
            </div>
          )
        })}
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className={`rounded-xl p-5 border transition-colors ${
              agent.status === 'active'
                ? 'bg-slate-900 border-slate-700 hover:border-violet-500/40'
                : 'bg-slate-900/50 border-slate-800/60'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                    agent.status === 'active'
                      ? 'bg-violet-600/20 text-violet-400'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {agent.name.charAt(0)}
                </div>
                <div>
                  <h3 className={`text-sm font-semibold ${agent.status === 'active' ? 'text-slate-100' : 'text-slate-400'}`}>
                    {agent.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">{agent.role}</p>
                </div>
              </div>
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  agent.status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-700/50 text-slate-500'
                }`}
              >
                {agent.status === 'active' ? 'Active' : 'Coming Soon'}
              </span>
            </div>

            <p className={`text-xs leading-relaxed mb-4 ${agent.status === 'active' ? 'text-slate-400' : 'text-slate-500'}`}>
              {agent.description}
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-500">
                {agent.skills} skills
              </span>
              <span className="text-xs text-slate-600">
                Phase {agent.phase}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
