// Cloudflare Browser Integrity Check on smartgenapp.com rejects non-browser
// User-Agents with 403 (error 1010). Every server-side supabase-js call from
// Vercel was blocked ("Unauthorized" on login, silent failures elsewhere).
// Patch global fetch once so ALL server-side requests to the Supabase API
// carry a browser UA, regardless of which file creates the client.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const supabaseHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').host
    } catch {
      return ''
    }
  })()
  if (!supabaseHost) return

  const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      if (url.includes(supabaseHost)) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined)
        )
        headers.set('User-Agent', BROWSER_UA)
        return originalFetch(input, { ...init, headers })
      }
    } catch {
      // Fall through to the untouched fetch on any parsing surprise.
    }
    return originalFetch(input, init)
  }) as typeof fetch
}
