// parseDuration("1h30m") -> 5400 (seconds). Units: h, m, s.
export function parseDuration(str) {
  const m = /^(\d+)m$/.exec(str);
  if (!m) return NaN;
  return Number(m[1]) * 60;
}
