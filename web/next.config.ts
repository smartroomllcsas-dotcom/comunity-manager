import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: {
    '/*': ['./node_modules/ffmpeg-static/**/*'],
    '/api/uploads/chat-media': ['./node_modules/ffmpeg-static/**/*'],
  },
  allowedDevOrigins: ['3c2a-38-191-41-53.ngrok-free.app'],
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

export default nextConfig
