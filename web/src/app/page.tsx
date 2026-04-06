const stats = [
  { label: 'Active Clients', value: '12', change: '+2 this month', color: 'text-violet-400' },
  { label: 'Skills Loaded', value: '47', change: '5 categories', color: 'text-emerald-400' },
  { label: 'Agents Online', value: '4/11', change: 'Phase 1 active', color: 'text-amber-400' },
  { label: 'Tools Available', value: '23', change: 'All operational', color: 'text-sky-400' },
]

const quickActions = [
  { label: 'Onboard Client', description: 'Set up a new client profile', href: '/clients', icon: UserPlusIcon },
  { label: 'Create Content', description: 'Generate posts with AI', href: '/chat', icon: PenIcon },
  { label: 'View Calendar', description: 'Check content schedule', href: '/calendar', icon: CalIcon },
  { label: 'Generate Report', description: 'Analytics & performance', href: '#', icon: ChartIcon },
]

const recentActivity = [
  { action: 'Content published for TechStart', time: '2 hours ago', status: 'success' },
  { action: 'New client onboarded: FreshBites', time: '5 hours ago', status: 'success' },
  { action: 'Weekly report generated for Bloom & Co', time: '1 day ago', status: 'success' },
  { action: 'Calendar updated: 15 posts scheduled', time: '1 day ago', status: 'info' },
  { action: 'Agent training completed: Content Writer', time: '2 days ago', status: 'info' },
]

export default function Dashboard() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Welcome back</h1>
        <p className="text-slate-400 mt-1">Here is what is happening across your managed communities.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-500 mt-2">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <a
                key={action.label}
                href={action.href}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-violet-500/40 hover:bg-slate-800/50 transition-colors group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center mb-3 group-hover:bg-violet-600/30 transition-colors">
                  <Icon className="w-5 h-5 text-violet-400" />
                </div>
                <p className="text-sm font-medium text-slate-200">{action.label}</p>
                <p className="text-xs text-slate-500 mt-1">{action.description}</p>
              </a>
            )
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Recent Activity</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {recentActivity.map((item, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-5 py-3.5 ${
                i < recentActivity.length - 1 ? 'border-b border-slate-800' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    item.status === 'success' ? 'bg-emerald-500' : 'bg-sky-500'
                  }`}
                />
                <span className="text-sm text-slate-300">{item.action}</span>
              </div>
              <span className="text-xs text-slate-500">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function CalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
