import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const SESSION_KEY = 'cm_user_id'

export async function GET(request: NextRequest) {
  const userId = request.cookies.get(SESSION_KEY)?.value
  const clientId = request.nextUrl.searchParams.get('clientId')

  if (!userId) {
    return NextResponse.json({ accounts: [], error: 'No autenticado' }, { status: 401 })
  }

  const clientsQuery = supabaseAdmin
    .from('cm_clients')
    .select('id')
    .eq('user_id', userId)

  if (clientId) {
    clientsQuery.eq('id', clientId)
  }

  const { data: clients, error: clientsError } = await clientsQuery

  if (clientsError) {
    return NextResponse.json({ accounts: [], error: clientsError.message }, { status: 500 })
  }

  const clientIds = (clients ?? []).map((client: { id: string }) => client.id)
  if (clientIds.length === 0) {
    return NextResponse.json({ accounts: [] })
  }

  const { data: accounts, error: accountsError } = await supabaseAdmin
    .from('cm_whatsapp_accounts')
    .select('id,client_id,waba_id,phone_number_id,display_phone_number,verified_name,connected_at')
    .in('client_id', clientIds)

  if (accountsError) {
    return NextResponse.json({ accounts: [], error: accountsError.message }, { status: 500 })
  }

  return NextResponse.json({ accounts: accounts ?? [] })
}
