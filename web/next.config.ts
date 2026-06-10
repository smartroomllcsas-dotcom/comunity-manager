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
}

export default nextConfig
