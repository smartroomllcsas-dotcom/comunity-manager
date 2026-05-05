import { NextRequest } from 'next/server'
import { handleMetaCallback } from '@/lib/meta-oauth-handler'

const CALLBACK_PATH = '/auth/facebook/callback'

export async function GET(request: NextRequest) {
  return handleMetaCallback(request, CALLBACK_PATH)
}
