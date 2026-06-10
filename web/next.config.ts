import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ['3c2a-38-191-41-53.ngrok-free.app'],
}

export default nextConfig
