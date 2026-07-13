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
