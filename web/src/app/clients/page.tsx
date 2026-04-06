'use client'

import { useState } from 'react'

interface Client {
  name: string
  industry: string
  platforms: string[]
  lastActivity: string
  postsThisMonth: number
  status: 'active' | 'onboarding' | 'paused'
}

const mockClients: Client[] = [
  {
    name: 'TechStart Solutions',
    industry: 'SaaS / Technology',
    platforms: ['LinkedIn', 'Twitter', 'Instagram'],
    lastActivity: '2 hours ago',
    postsThisMonth: 24,
    status: 'active',
  },
  {
    name: 'Bloom & Co',
    industry: 'Floral / Retail',
    platforms: ['Instagram', 'TikTok', 'Facebook'],
    lastActivity: '5 hours ago',
    postsThisMonth: 31,
    status: 'active',
  },
  {
    name: 'FreshBites',
    industry: 'Food & Beverage',
    platforms: ['Instagram', 'TikTok'],
    lastActivity: '1 day ago',
    postsThisMonth: 18,
    status: 'onboarding',
  },
  {
    name: 'UrbanFit Studio',
    industry: 'Fitness / Health',
    platforms: ['Instagram', 'TikTok', 'YouTube'],
    lastActivity: '3 hours ago',
    postsThisMonth: 22,
    status: 'active',
  },
  {
    name: 'GreenLeaf Organics',
    industry: 'Organic Products',
    platforms: ['Instagram', 'Facebook', 'LinkedIn'],
    lastActivity: '1 day ago',
    postsThisMonth: 15,
    status: 'active',
  },
  {
    name: 'Pixel Creative Agency',
    industry: 'Design / Marketing',
    platforms: ['LinkedIn', 'Twitter', 'Instagram', 'TikTok'],
    lastActivity: '6 hours ago',
    postsThisMonth: 28,
    status: 'active',
  },
]

const platformColors: Record<string, string> = {
  Instagram: 'bg-pink-500/20 text-pink-400',
  Twitter: 'bg-sky-500/20 text-sky-400',
  LinkedIn: 'bg-blue-800/30 text-blue-400',
  TikTok: 'bg-slate-600/30 text-slate-300',
  Facebook: 'bg-indigo-500/20 text-indigo-400',
  YouTube: 'bg-red-500/20 text-red-400',
}

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  onboarding: 'bg-amber-500/20 text-amber-400',
  paused: 'bg-slate-500/20 text-slate-400',
}

export default function ClientsPage() {
  const [showAddModal, setShowAddModal] = useState(false)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Clients</h1>
          <p className="text-slate-400 mt-1">{mockClients.length} managed accounts</p>
        </div>
        <button
          onClick={() => setShowAddModal(!showAddModal)}
          className="bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Client
        </button>
      </div>

      {showAddModal && (
        <div className="mb-6 bg-slate-900 border border-violet-500/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">New Client (Demo)</h3>
          <p className="text-xs text-slate-400">
            In production, this form would trigger the client onboarding workflow, creating a profile
            under .clients/ with brand voice, content pillars, platform configs, and scheduling
            preferences.
          </p>
          <button
            onClick={() => setShowAddModal(false)}
            className="mt-4 text-xs text-slate-500 hover:text-slate-300"
          >
            Close
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mockClients.map((client) => (
          <div
            key={client.name}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">{client.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{client.industry}</p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusStyles[client.status]}`}>
                {client.status}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {client.platforms.map((p) => (
                <span
                  key={p}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${platformColors[p] || 'bg-slate-700 text-slate-300'}`}
                >
                  {p}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-500">
                Last active: {client.lastActivity}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {client.postsThisMonth} posts/mo
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
