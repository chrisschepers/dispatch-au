// Freshness means a successfully validated snapshot, not a new incident.
export function sourceHealth(region, config, meta, attempt, now = Date.now()) {
  const fetched = Date.parse(meta?.fetched_at || '');
  const ready = Number.isFinite(fetched);
  const ageMs = ready ? now - fetched : null;
  const overdue = !ready || ageMs > config.staleAfter || ageMs < -120000;
  const consecutiveFailures = attempt?.failures || 0;
  const stale = overdue || !!meta?.stale || consecutiveFailures > 0;
  // Startup without a snapshot is visible immediately, but allow its first
  // request to finish before opening an outage notification.
  const firstFailure = Date.parse(attempt?.first_failure || '');
  const alert =
    consecutiveFailures >= 3 ||
    (ready && overdue) ||
    (!ready &&
      Number.isFinite(firstFailure) &&
      now - firstFailure > config.staleAfter);
  return {
    region,
    ready,
    stale,
    alert,
    state: !ready ? 'unavailable' : stale ? 'delayed' : 'healthy',
    fetchedAt: meta?.fetched_at || null,
    lastAttemptAt: attempt?.last_attempt || null,
    consecutiveFailures,
    firstFailureAt: attempt?.first_failure || null,
    staleAfterMs: config.staleAfter,
    pollIntervalMs: config.interval,
    error: meta?.error || attempt?.error || null,
  };
}
