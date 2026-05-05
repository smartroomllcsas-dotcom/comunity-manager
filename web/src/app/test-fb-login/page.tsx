import type { Metadata } from 'next'
import { Suspense } from 'react'
import FacebookLoginButton from '@/components/FacebookLoginButton'
import InstagramLoginButton from '@/components/InstagramLoginButton'
import WhatsAppConnectButton from '@/components/WhatsAppConnectButton'
import IGCallbackResult from './IGCallbackResult'

export const metadata: Metadata = {
  title: 'Test Social Login - Community Manager',
  description: 'Página de prueba para validar Facebook Login y Instagram Business Login',
}

export default function TestSocialLoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <a href="/" className="text-violet-400 hover:text-violet-300 text-sm">
          ← Volver
        </a>
        <h1 className="text-3xl font-bold mt-4 mb-2">Test · Social Login</h1>
        <p className="text-sm text-slate-400 mb-8">
          Prueba los flujos de Facebook (JS SDK) e Instagram Business Login (server-side OAuth).
        </p>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 mb-6">
          <h2 className="text-base font-semibold mb-3">Facebook Login (JS SDK)</h2>
          <FacebookLoginButton />
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 mb-6">
          <h2 className="text-base font-semibold mb-3">Instagram Business Login</h2>
          <InstagramLoginButton />
          <Suspense fallback={null}>
            <IGCallbackResult />
          </Suspense>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 mb-6">
          <h2 className="text-base font-semibold mb-3">WhatsApp Embedded Signup</h2>
          <WhatsAppConnectButton />
        </div>

        <div className="space-y-3 text-sm text-slate-400">
          <h2 className="text-base font-semibold text-slate-200">Notas</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              Facebook usa <code>FB.login()</code> y devuelve el token en el browser.
            </li>
            <li>
              Instagram redirige a la home (<code>/</code>); un middleware enruta el <code>code</code> a{' '}
              <code>/api/auth/instagram/callback</code>, donde se canjea por un token long-lived (60 días) y se
              consulta el perfil.
            </li>
            <li>
              Los scopes <code>pages_manage_posts</code> /{' '}
              <code>instagram_business_content_publish</code> requieren App Review aprobado o que el usuario sea
              Admin/Developer/Tester de la app en modo Development.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
