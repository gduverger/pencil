/**
 * Number post-check (10.5): every currency or percentage token in a model response must be a
 * number present in the supplied data (allowing for display rounding). Anything else is rejected.
 */

export interface NumberToken {
  raw: string;
  value: number;
  kind: 'currency' | 'percent' | 'plain';
}

const TOKEN_RE =
  /(\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|million|thousand|bn|billion))?)|(\d[\d,]*(?:\.\d+)?\s?%)|(\b\d[\d,]*(?:\.\d+)?\s?(?:x|×)\b)/gi;

function parseNumber(s: string): number {
  return Number(s.replace(/[$,%\sx×]/gi, ''));
}

/** Currency, percentage and multiple tokens in a text, with their numeric values. */
export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    if (m[1]) {
      let v = parseNumber(raw.replace(/(k|m|million|thousand|bn|billion)$/i, ''));
      const suffix = raw.toLowerCase().match(/(k|m|million|thousand|bn|billion)$/)?.[1];
      if (suffix === 'k' || suffix === 'thousand') v *= 1_000;
      else if (suffix === 'm' || suffix === 'million') v *= 1_000_000;
      else if (suffix === 'bn' || suffix === 'billion') v *= 1_000_000_000;
      out.push({ raw, value: v, kind: 'currency' });
    } else if (m[2]) out.push({ raw, value: parseNumber(raw) / 100, kind: 'percent' });
    else if (m[3]) out.push({ raw, value: parseNumber(raw), kind: 'plain' });
  }
  return out;
}

/** Every finite number in a data object (deep), the allowed vocabulary for a response. */
export function numbersInData(data: unknown, out: Set<number> = new Set()): Set<number> {
  if (typeof data === 'number') {
    if (Number.isFinite(data)) out.add(data);
  } else if (typeof data === 'string') {
    for (const t of extractNumbers(data)) out.add(t.value);
    const n = Number(data);
    if (data.trim() !== '' && Number.isFinite(n)) out.add(n);
  } else if (Array.isArray(data)) {
    for (const x of data) numbersInData(x, out);
  } else if (data && typeof data === 'object') {
    for (const v of Object.values(data as Record<string, unknown>)) numbersInData(v, out);
  }
  return out;
}

/**
 * Does a token match an allowed number, allowing for display rounding: dollars to the nearest
 * $1,000 or $100 (7.13), percentages to two decimals, and a relative tolerance of 0.6%.
 */
export function tokenMatches(token: NumberToken, allowed: ReadonlySet<number>): boolean {
  for (const a of allowed) {
    if (token.kind === 'percent') {
      // Allowed values may be fractions (0.055) or already percentages (5.5).
      if (closeTo(token.value, a) || closeTo(token.value * 100, a)) return true;
      continue;
    }
    if (closeTo(token.value, a)) return true;
  }
  return false;
}

function closeTo(x: number, a: number): boolean {
  if (x === a) return true;
  const scale = Math.max(Math.abs(a), Math.abs(x));
  if (scale === 0) return false;
  const rel = Math.abs(x - a) / scale;
  if (rel <= 0.006) return true;
  // Rounding steps of 7.13: within half a step at the step that applies to the allowed value.
  const step =
    Math.abs(a) >= 100_000 ? 1000 : Math.abs(a) >= 1000 ? 100 : Math.abs(a) >= 1 ? 1 : 0.0001;
  return Math.abs(x - a) <= step / 2 + 1e-9;
}

export interface PostCheckResult {
  ok: boolean;
  tokens: NumberToken[];
  offending: NumberToken[];
}

export function checkNumbers(text: string, data: unknown): PostCheckResult {
  const allowed = numbersInData(data);
  const tokens = extractNumbers(text);
  const offending = tokens.filter((t) => !tokenMatches(t, allowed));
  return { ok: offending.length === 0, tokens, offending };
}
