import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// `standalone` output is for Docker/self-hosted images (produces .next/standalone/).
// On Vercel we need the default output so the Vercel builder can convert routes to lambdas.
// The VERCEL env var is always set to "1" on Vercel builds.
const isVercel = process.env.VERCEL === '1'

const withNextIntl = createNextIntlPlugin('./i18n.ts')

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: 'standalone' as const }),
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: {
    '/*': ['./node_modules/ffmpeg-static/**/*'],
    '/api/uploads/chat-media': ['./node_modules/ffmpeg-static/**/*'],
  },
  allowedDevOrigins: ['3c2a-38-191-41-53.ngrok-free.app'],
  async redirects() {
    return [
      // La pantalla de automatización pasó de /whatsapp/automatizacion (nombre
      // confuso, parecía solo WhatsApp) a /automatizacion-leads. Redirigimos la
      // ruta vieja para no romper enlaces o marcadores guardados.
      {
        source: '/whatsapp/automatizacion',
        destination: '/automatizacion-leads',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      // Twemoji stickers (usados en EmojiStickerPicker)
      { protocol: 'https', hostname: 'cdn.jsdelivr.net', pathname: '/gh/twitter/twemoji@**' },
      // Media firmada del bucket chat-media en Supabase self-hosted
      { protocol: 'https', hostname: 'smartmedia-api.smartgenapp.com', pathname: '/storage/v1/object/sign/**' },
      // Adjuntos servidos por Meta CDN (mensajes de FB/IG entrantes)
      { protocol: 'https', hostname: '*.fbcdn.net' },
      { protocol: 'https', hostname: '*.cdninstagram.com' },
      // Avatares y attachments legacy vía respond.io
      { protocol: 'https', hostname: '*.respond.io' },
    ],
  },
}

export default withNextIntl(nextConfig)
