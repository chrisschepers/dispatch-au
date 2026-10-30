// One malformed record must not stop a whole state. On 30-10 South Australia
// stood still for 21 hours because a single CAP alert lacked a WarningLevel.
// Parsers now skip and count bad records; only a snapshot in which every
// record is rejected counts as a failure, because then the format itself has
// changed (the store then keeps the last good records and the outage alerts).
export function skipCounter() {
  const reasons = {};
  let count = 0;
  return {
    skip(reason) {
      count++;
      reasons[reason] = (reasons[reason] || 0) + 1;
    },
    get count() {
      return count;
    },
    summary() {
      return count ? { count, reasons: { ...reasons } } : null;
    },
    check(total, source) {
      if (total > 0 && count >= total)
        throw Error(
          `Every ${source} record rejected: ${Object.keys(reasons).join('; ')}`.slice(0, 160),
        );
    },
  };
}

// Last snapshot's skipped records per region, for /v1/status.
export const skippedByRegion = new Map();
