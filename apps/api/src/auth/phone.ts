/** Normalises to E.164 (+<cc><number>). Local Indian numbers must be 10 digits starting 6-9. Returns null if invalid. */
export function normalizePhone(input: string, cc = '91'): string | null {
  const s = (input ?? '').trim().replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) {
    const d = s.slice(1);
    if (!/^\d{8,15}$/.test(d)) return null;
    if (d.startsWith(cc) && cc === '91' && !/^91[6-9]\d{9}$/.test(d)) return null;
    return '+' + d;
  }
  if (!/^\d+$/.test(s)) return null;
  let local = s;
  if (local.length === 12 && local.startsWith(cc)) local = local.slice(cc.length);
  else if (local.length === 11 && local.startsWith('0')) local = local.slice(1);
  if (cc === '91' && !/^[6-9]\d{9}$/.test(local)) return null;
  if (local.length < 7 || local.length > 12) return null;
  return `+${cc}${local}`;
}
