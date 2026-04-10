'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CMAgent } from '@/types/database'

export default function AgentsPage() {
  const [agents, setAgents] = useState<CMAgent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('cm_agents')
      .select('*')
      .order('phase', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => {
        setAgents(data ?? [])
        setLoading(false)
      })
  }, [])

  const activeCount = agents.filter((a) => a.status === 'active').length
  const totalSkills = agents.reduce((sum, a) => sum + a.skills, 0)

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const phases = [...new Set(agents.map(a => a.phase))].sort()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Agentes</h1>
        <p className="text-slate-400 mt-1">
          {activeCount} activos, {agents.length - activeCount} próximamente | {totalSkills} skills totales
        </p>
      </div>

      {/* Phase Overview */}
      <div className="flex gap-4 mb-6">
        {phases.map((phase) => {
          const phaseAgents = agents.filter((a) => a.phase === phase)
          const isActive = phaseAgents.some(a => a.status === 'active')
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
                  Fase {phase}
                </p>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-700/50 text-slate-500'
                  }`}
                >
                  {isActive ? 'Activa' : 'Planeada'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-200 mt-1">{phaseAgents.length}</p>
              <p className="text-xs text-slate-500">agentes</p>
            </div>
          )
        })}
      </div>

      {/* Agent Grid */}
      {agents.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-slate-400">No hay agentes configurados aún.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
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
                  {agent.status === 'active' ? 'Activo' : 'Próximamente'}
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
                  Fase {agent.phase}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
