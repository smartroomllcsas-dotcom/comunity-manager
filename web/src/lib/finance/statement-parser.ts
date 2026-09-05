/**
 * Statement CSV parser — pure. Port of FounderOS-DEMO/lib/statements.ts.
 * v1 targets common shapes (Date / Description / Amount, or Debit + Credit
 * columns), plus credit-card sign convention. Rows it can't read are skipped
 * honestly rather than guessed.
 */

export type ParsedRow = {
  /** ISO date YYYY-MM-DD */
  date: string;
  description: string;
  /** Signed cents. Negative = expense (money out), positive = income. */
  amountCents: number;
  /** The export's own category column, when present. */
  rawCategory?: string;
};

export type LedgerRow = ParsedRow & { category: string };

// ── CSV tokenizer (RFC 4180-ish; supports quoted fields with commas/newlines) ─

export function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

// ── Header detection ──────────────────────────────────────────────────────

function findCol(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  // partial match
  for (const n of names) {
    const i = lower.findIndex((h) => h.includes(n.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

function cell(cells: string[], idx: number): string {
  if (idx < 0 || idx >= cells.length) return '';
  return cells[idx]?.trim() ?? '';
}

function parseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : ''));
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // MM/DD/YYYY or M/D/YY
  const us = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (us) {
    let [, mm, dd, yy] = us;
    let year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// ── Parser ────────────────────────────────────────────────────────────────

/** Parse a bank/CC statement CSV into normalized rows. */
export function parseStatementCsv(text: string): ParsedRow[] {
  const records = tokenizeCsv(text);
  if (records.length < 2) return [];

  const headers = records[0].map((h) => h.trim());
  const dateCol = findCol(headers, ['date', 'transaction date', 'posted date', 'posting date']);
  const descCol = findCol(headers, ['description', 'name', 'merchant', 'details', 'payee']);
  const amtCol = findCol(headers, ['amount', 'transaction amount']);
  const debitCol = findCol(headers, ['debit', 'withdrawal']);
  const creditCol = findCol(headers, ['credit', 'deposit']);
  const categoryCol = findCol(headers, ['category']);

  if (dateCol < 0 || descCol < 0) return [];
  if (amtCol < 0 && debitCol < 0 && creditCol < 0) return [];

  const isCreditCard =
    /credit\s*card/i.test(headers.join(' ')) ||
    headers.some((h) => /^type$/i.test(h));

  const out: ParsedRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    const dRaw = cell(cells, dateCol);
    const date = parseDate(dRaw);
    if (!date) continue;
    const description = cell(cells, descCol);
    if (!description) continue;

    let amountCents: number | null = null;
    if (amtCol >= 0) {
      const raw = cell(cells, amtCol);
      amountCents = parseAmountCents(raw);
      // CC exports often list positive = expense. Flip so negative = expense.
      if (amountCents !== null && isCreditCard) amountCents = -amountCents;
    } else {
      const debit = parseAmountCents(cell(cells, debitCol));
      const credit = parseAmountCents(cell(cells, creditCol));
      if (debit !== null && debit !== 0) amountCents = -Math.abs(debit);
      else if (credit !== null && credit !== 0) amountCents = Math.abs(credit);
    }

    if (amountCents === null || amountCents === 0) continue;

    const rawCat = cell(cells, categoryCol);
    out.push({ date, description, amountCents, rawCategory: rawCat || undefined });
  }
  return out;
}

// ── Categorization ────────────────────────────────────────────────────────

const KEYWORD_RULES: Array<{ match: RegExp; category: string }> = [
  { match: /anthropic|claude/i, category: 'AI · LLM' },
  { match: /openai|chatgpt/i, category: 'AI · LLM' },
  { match: /cursor|copilot|codeium/i, category: 'Developer Tools' },
  { match: /github|gitlab|vercel|netlify|render|fly\.io|railway/i, category: 'Developer Tools' },
  { match: /supabase|planetscale|neon|firebase|mongo|redis/i, category: 'Infrastructure' },
  { match: /aws|amazon web|google cloud|gcp|azure|cloudflare/i, category: 'Infrastructure' },
  { match: /stripe|paypal|wise|payoneer/i, category: 'Payment Fees' },
  { match: /meta ads|facebook ads|google ads|tiktok ads|linkedin ads/i, category: 'Advertising' },
  { match: /uber|lyft|didi|taxi/i, category: 'Transport' },
  { match: /amazon|shopify|mercado libre/i, category: 'Shopping' },
  { match: /netflix|spotify|hbo|disney|apple\.com\/bill|youtube premium/i, category: 'Entertainment' },
  { match: /salary|payroll|nomina|contractor|freelancer|upwork|fiverr/i, category: 'Contractors' },
  { match: /rent|arriendo|lease/i, category: 'Rent' },
  { match: /electric|water|internet|claro|movistar|tigo|verizon|att/i, category: 'Utilities' },
];

export function categorize(row: ParsedRow): string {
  const desc = row.description.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(desc)) return rule.category;
  }
  if (row.rawCategory && row.rawCategory.length > 1) return row.rawCategory;
  return 'Uncategorized';
}

/** Stable hash for dedup: sha1-lite of date + amount + description prefix. */
export function rowHash(row: ParsedRow): string {
  const key = `${row.date}|${row.amountCents}|${row.description.slice(0, 60).toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}_${row.date}_${row.amountCents}`;
}

export function toLedgerRows(rows: ParsedRow[]): LedgerRow[] {
  return rows.map((r) => ({ ...r, category: categorize(r) }));
}
