'use client'

import { useState } from 'react'

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const timeSlots = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']

interface ScheduledPost {
  day: number
  time: number
  platform: string
  title: string
  pillar: string
}

const platformStyle: Record<string, { bg: string; text: string; border: string }> = {
  Instagram: { bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  Twitter: { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
  LinkedIn: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-500/30' },
  TikTok: { bg: 'bg-slate-700/40', text: 'text-slate-300', border: 'border-slate-500/30' },
  Facebook: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
}

const pillars = [
  { name: 'Educational', color: 'bg-emerald-500', count: 5 },
  { name: 'Promotional', color: 'bg-violet-500', count: 4 },
  { name: 'Engagement', color: 'bg-amber-500', count: 3 },
  { name: 'Behind-the-scenes', color: 'bg-sky-500', count: 3 },
  { name: 'User-generated', color: 'bg-pink-500', count: 2 },
]

const scheduledPosts: ScheduledPost[] = [
  { day: 0, time: 1, platform: 'Instagram', title: 'Product showcase carousel', pillar: 'Promotional' },
  { day: 0, time: 5, platform: 'LinkedIn', title: 'Industry insights article', pillar: 'Educational' },
  { day: 1, time: 2, platform: 'Twitter', title: 'Tip of the day thread', pillar: 'Educational' },
  { day: 1, time: 7, platform: 'TikTok', title: 'Behind the scenes reel', pillar: 'Behind-the-scenes' },
  { day: 2, time: 1, platform: 'Instagram', title: 'User testimonial story', pillar: 'User-generated' },
  { day: 2, time: 4, platform: 'Facebook', title: 'Community poll', pillar: 'Engagement' },
  { day: 3, time: 0, platform: 'LinkedIn', title: 'Team spotlight post', pillar: 'Behind-the-scenes' },
  { day: 3, time: 3, platform: 'Instagram', title: 'Reel: Quick tutorial', pillar: 'Educational' },
  { day: 3, time: 8, platform: 'Twitter', title: 'Engagement question', pillar: 'Engagement' },
  { day: 4, time: 1, platform: 'TikTok', title: 'Trending audio clip', pillar: 'Engagement' },
  { day: 4, time: 5, platform: 'Instagram', title: 'Weekend promo teaser', pillar: 'Promotional' },
  { day: 5, time: 2, platform: 'Instagram', title: 'Saturday lifestyle post', pillar: 'Promotional' },
  { day: 5, time: 6, platform: 'Facebook', title: 'Weekend engagement post', pillar: 'User-generated' },
  { day: 6, time: 3, platform: 'Instagram', title: 'Week recap carousel', pillar: 'Educational' },
  { day: 6, time: 7, platform: 'Twitter', title: 'Week ahead preview', pillar: 'Promotional' },
  { day: 0, time: 9, platform: 'TikTok', title: 'Evening trend video', pillar: 'Engagement' },
  { day: 2, time: 10, platform: 'Instagram', title: 'Tutorial highlight', pillar: 'Educational' },
]

export default function CalendarPage() {
  const [selectedClient] = useState('TechStart Solutions')
  const totalPosts = pillars.reduce((sum, p) => sum + p.count, 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Content Calendar</h1>
          <p className="text-slate-400 mt-1">Week of April 6 - 12 | {selectedClient}</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm hover:bg-slate-700 transition-colors">
            Previous
          </button>
          <button className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-sm hover:bg-slate-700 transition-colors">
            Next
          </button>
        </div>
      </div>

      {/* Pillar Distribution Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-300">Content Pillar Distribution</p>
          <p className="text-xs text-slate-500">{totalPosts} posts this week</p>
        </div>
        <div className="flex rounded-lg overflow-hidden h-3 mb-3">
          {pillars.map((pillar) => (
            <div
              key={pillar.name}
              className={`${pillar.color}`}
              style={{ width: `${(pillar.count / totalPosts) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {pillars.map((pillar) => (
            <div key={pillar.name} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-sm ${pillar.color}`} />
              <span className="text-xs text-slate-400">
                {pillar.name} ({pillar.count})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Header Row */}
        <div className="grid grid-cols-8 border-b border-slate-800">
          <div className="p-3 text-xs font-medium text-slate-500 border-r border-slate-800">Time</div>
          {days.map((day) => (
            <div key={day} className="p-3 text-xs font-medium text-slate-400 text-center border-r border-slate-800 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Time Rows */}
        {timeSlots.map((time, timeIdx) => (
          <div key={time} className="grid grid-cols-8 border-b border-slate-800/50 last:border-b-0">
            <div className="p-2 text-[11px] text-slate-600 border-r border-slate-800/50 flex items-start pt-3">
              {time}
            </div>
            {days.map((_, dayIdx) => {
              const post = scheduledPosts.find((p) => p.day === dayIdx && p.time === timeIdx)
              const style = post ? platformStyle[post.platform] : null
              return (
                <div
                  key={dayIdx}
                  className="p-1 min-h-[52px] border-r border-slate-800/50 last:border-r-0"
                >
                  {post && style && (
                    <div
                      className={`${style.bg} border ${style.border} rounded-md p-1.5 cursor-pointer hover:opacity-80 transition-opacity`}
                    >
                      <p className={`text-[10px] font-medium ${style.text} truncate`}>
                        {post.platform}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{post.title}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Platform Legend */}
      <div className="flex flex-wrap gap-4 mt-4">
        {Object.entries(platformStyle).map(([name, style]) => (
          <div key={name} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${style.bg} border ${style.border}`} />
            <span className="text-xs text-slate-500">{name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
