'use client'

import { useState } from 'react'
import ChatMessage from '@/components/ChatMessage'

const modes = [
  { id: 'A', label: 'Mode A', description: 'Full Auto' },
  { id: 'B', label: 'Mode B', description: 'Supervised' },
  { id: 'C', label: 'Mode C', description: 'Manual' },
]

const clients = [
  'TechStart Solutions',
  'Bloom & Co',
  'FreshBites',
  'UrbanFit Studio',
  'GreenLeaf Organics',
]

const initialMessages: { role: 'user' | 'assistant'; content: string; timestamp: string }[] = [
  {
    role: 'assistant',
    content:
      'Hello! I am your ComunityAgent assistant. Select a client and mode above, then tell me what you need. I can create content, schedule posts, analyze performance, or help with strategy.',
    timestamp: '10:00 AM',
  },
]

export default function ChatPage() {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [activeMode, setActiveMode] = useState('A')
  const [selectedClient, setSelectedClient] = useState(clients[0])

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage = {
      role: 'user' as const,
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const assistantMessage = {
      role: 'assistant' as const,
      content: `[${activeMode === 'A' ? 'Auto' : activeMode === 'B' ? 'Supervised' : 'Manual'} Mode] Processing request for ${selectedClient}. In production, this would route through the orchestrator agent to handle: "${input}"`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages([...messages, userMessage, assistantMessage])
    setInput('')
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top Bar */}
      <div className="border-b border-slate-800 bg-slate-950/80 backdrop-blur px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-100">Chat</h1>
          <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeMode === mode.id
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode.label}
                <span className="hidden sm:inline ml-1 text-[10px] opacity-70">
                  {mode.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
        >
          {clients.map((client) => (
            <option key={client} value={client}>
              {client}
            </option>
          ))}
        </select>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-800 bg-slate-950/80 backdrop-blur px-6 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`Message ComunityAgent about ${selectedClient}...`}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
          <button
            onClick={handleSend}
            className="bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-center text-xs text-slate-600 mt-2 max-w-3xl mx-auto">
          Mode {activeMode} active for {selectedClient}
        </p>
      </div>
    </div>
  )
}
