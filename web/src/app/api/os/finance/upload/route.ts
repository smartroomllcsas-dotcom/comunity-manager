/**
 * POST /api/os/finance/upload
 *
 * Multipart form with a CSV `file` field. Parses the statement, categorizes
 * rows, and inserts into smarttalk.finance_transactions scoped to the caller's
 * primary brand (orgId = cm_clients.id in this data model).
 *
 * Returns { ok, parsed, inserted, filename }.
 */
import { NextResponse } from 'next/server';
import { requireOrgIdFromRequest } from '@/lib/os/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseStatementCsv, toLedgerRows, rowHash } from '@/lib/finance/statement-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let orgId: string;
  try {
    orgId = await requireOrgIdFromRequest();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }

  let filename = 'statement.csv';
  let text = '';
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'missing_file' }, { status: 400 });
    }
    filename = (file as File).name || filename;
    text = await (file as File).text();
  } catch (e: any) {
    return NextResponse.json({ error: 'invalid_form', detail: e?.message }, { status: 400 });
  }

  if (!text.trim()) {
    return NextResponse.json({ error: 'empty_file' }, { status: 400 });
  }

  const parsed = parseStatementCsv(text);
  if (parsed.length === 0) {
    return NextResponse.json({ error: 'no_rows_parsed', parsed: 0, inserted: 0 }, { status: 200 });
  }

  const ledger = toLedgerRows(parsed);
  const sb = createAdminClient('smarttalk');

  const rows = ledger.map((r) => ({
    brand_id: orgId,
    source: 'statement_upload',
    external_id: rowHash(r),
    amount_cents: r.amountCents,
    currency: 'USD',
    category: r.category,
    tx_date: r.date,
    description: r.description,
    raw: { rawCategory: r.rawCategory ?? null, filename },
  }));

  const { data, error } = await sb
    .from('finance_transactions')
    .upsert(rows, { onConflict: 'brand_id,source,external_id', ignoreDuplicates: true })
    .select('id');

  if (error) {
    return NextResponse.json(
      { error: 'insert_failed', detail: error.message, parsed: parsed.length, inserted: 0 },
      { status: 500 },
    );
  }

  const inserted = data?.length ?? 0;

  // Best-effort audit record. Non-blocking.
  await sb
    .from('finance_uploaded_statements')
    .insert({
      brand_id: orgId,
      filename,
      parsed_count: parsed.length,
      meta: { inserted },
    })
    .then(() => undefined, () => undefined);

  return NextResponse.json({ ok: true, parsed: parsed.length, inserted, filename });
}
