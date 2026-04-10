'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { CMClient } from '@/types/database'
import ChatMessage from '@/components/ChatMessage'

const modes = [
  { id: 'A', label: 'Modo A', description: 'Conversacional' },
  { id: 'B', label: 'Modo B', description: 'Aprobación' },
  { id: 'C', label: 'Modo C', description: 'Autónomo' },
]

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export default function ChatPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<CMClient[]>([])
  const [selectedClient, setSelectedClient] = useState('Todos los Clientes')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Bienvenido a **ComunityAgent**. Soy tu orquestador de gestión de comunidades con 11 agentes especializados y 68 skills a tu servicio.\n\nSelecciona un cliente y modo arriba, luego dime qué necesitas. Puedo:\n\n- **Crear contenido** para cualquier plataforma\n- **Planificar calendarios** y programaciones\n- **Analizar métricas** y competencia\n- **Gestionar comunidad** y engagement\n- **Construir marca** identidad y voz\n- **Gestionar ads**, SEO, campañas de email\n- **Generar reportes** e insights\n\n¿Cómo quieres empezar?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [input, setInput] = useState('')
  const [activeMode, setActiveMode] = useState('B')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('cm_clients')
      .select('*')
      .eq('user_id', user.id)
      .then(({ data }) => setClients(data ?? []))
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    try {
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          mode: activeMode,
          client: selectedClient,
        }),
      })

      const data = await res.json()

      if (data.error) {
        setMessages([
          ...newMessages,
          {
            role: 'assistant',
            content: `Error: ${data.error}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      } else {
        setMessages([
          ...newMessages,
          {
            role: 'assistant',
            content: data.response,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      }
    } catch {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Error de conexión. Verifica la configuración de tu API.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const modeLabel = activeMode === 'A' ? 'A (Conversacional)' : activeMode === 'B' ? 'B (Aprobación)' : 'C (Autónomo)'

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
          <option value="Todos los Clientes">Todos los Clientes</option>
          {clients.map((client) => (
            <option key={client.id} value={client.name}>
              {client.name}
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
          {isLoading && (
            <div className="flex items-center gap-3 py-4">
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">CA</span>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-800 bg-slate-950/80 backdrop-blur px-6 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={`Mensaje para ComunityAgent sobre ${selectedClient}...`}
            disabled={isLoading}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:opacity-50 text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors"
          >
            {isLoading ? '...' : 'Enviar'}
          </button>
        </div>
        <p className="text-center text-xs text-slate-600 mt-2 max-w-3xl mx-auto">
          Modo {modeLabel} | {selectedClient} | Impulsado por Claude
        </p>
      </div>
    </div>
  )
}
