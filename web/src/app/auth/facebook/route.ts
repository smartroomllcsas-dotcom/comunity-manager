import { NextRequest } from 'next/server'
import { initiateMetaOAuth } from '@/lib/meta-oauth-handler'

const CALLBACK_PATH = '/auth/facebook/callback'

export async function GET(request: NextRequest) {
  return initiateMetaOAuth(request, CALLBACK_PATH)
}
