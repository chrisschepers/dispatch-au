const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// ACT's description uses Canberra wall time without an offset; Intl applies DST.
export function actDate(value, timeZone = 'Australia/Sydney') {
  const m = String(value)
    .trim()
    .match(
      /^(\d{1,2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/,
    );
  if (!m || !months.includes(m[2])) return null;
  const parts = [+m[3], months.indexOf(m[2]) + 1, +m[1], +m[4], +m[5], +m[6]];
  const wanted = Date.UTC(parts[0], parts[1] - 1, ...parts.slice(2));
  const utc = new Date(wanted);
  if (
    utc.getUTCFullYear() !== parts[0] ||
    utc.getUTCMonth() + 1 !== parts[1] ||
    utc.getUTCDate() !== parts[2] ||
    utc.getUTCHours() !== parts[3] ||
    utc.getUTCMinutes() !== parts[4] ||
    utc.getUTCSeconds() !== parts[5]
  )
    return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let candidate = wanted - 10 * 3600000;
  const localParts = (n) =>
    Object.fromEntries(fmt.formatToParts(n).map((p) => [p.type, p.value]));
  for (let i = 0; i < 3; i++) {
    const p = localParts(candidate);
    const actual = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    if (actual === wanted) return new Date(candidate).toISOString();
    candidate += wanted - actual;
  }
  return null;
}
