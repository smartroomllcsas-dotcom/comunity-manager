'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, register } from '@/lib/auth'
import LegalLinks from '@/components/LegalLinks'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    setPending(true)

    try {
      const result = isRegister
        ? await register(email, password, name)
        : await login(email, password)

      if (result.error) {
        setError(result.error)
        return
      }

      router.push('/')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-20 w-20 overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-cyan-500/10">
            <img
              src="/community-manager-logo.png"
              alt="Community Manager"
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-3xl font-bold text-slate-100 tracking-tight">
            <span className="text-violet-500">Comunity</span>Agent
          </h1>
          <p className="text-sm text-slate-500 mt-2">Gestión de Comunidades con IA · Inbox multicanal</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-5">
            {isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}
          </h2>

          <form action="/api/auth/local" method="post" onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="action" value={isRegister ? 'register' : 'login'} />
            {isRegister && (
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Nombre</label>
                <input
                  type="text"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isRegister}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                  placeholder="Tu nombre"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Email</label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Contraseña</label>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="Tu contraseña"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {pending ? 'Cargando...' : isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="mt-5 text-center space-y-2">
            <button
              onClick={() => { setIsRegister(!isRegister); setError('') }}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
            </button>
            <p className="text-xs text-slate-500">
              Login unificado: tu cuenta da acceso al panel de CommunityAgent y a la bandeja multicanal.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <LegalLinks
            className="flex items-center justify-center gap-4 text-xs text-slate-500"
            linkClassName="hover:text-slate-300 transition-colors"
          />
        </div>
      </div>
    </div>
  )
}
