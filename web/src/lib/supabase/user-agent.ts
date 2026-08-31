// Cloudflare Browser Integrity Check on smartgenapp.com blocks non-browser
// User-Agents (403 error 1010), which killed every server-side supabase-js
// call from Vercel ("Unauthorized" on login). Spoof a browser UA server-side.
export const SUPABASE_SERVER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
}
