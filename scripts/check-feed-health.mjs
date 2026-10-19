import { sources } from '../backend/source-config.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assessStatus(status, now = Date.now()) {
  if (
    !status ||
    !Array.isArray(status.sources) ||
    !Number.isFinite(Date.parse(status.checkedAt)) ||
    Math.abs(now - Date.parse(status.checkedAt)) > 120000
  )
    throw Error('Status endpoint is missing or not current');
  return Object.entries(sources).map(([region, config]) => {
    const rows = status.sources.filter((s) => s.region === region);
    const s = rows.length === 1 ? rows[0] : null;
    const age = now - Date.parse(s?.fetchedAt);
    const valid =
      s &&
      typeof s.ready === 'boolean' &&
      typeof s.stale === 'boolean' &&
      typeof s.alert === 'boolean' &&
      ['healthy', 'delayed', 'unavailable'].includes(s.state) &&
      Number.isInteger(s.consecutiveFailures) &&
      s.consecutiveFailures >= 0;
    const alert =
      !valid ||
      s.alert === true ||
      s.consecutiveFailures >= 3 ||
      (s.ready &&
        (!Number.isFinite(age) || age > config.staleAfter || age < -120000)) ||
      (!s.ready &&
        (!Number.isFinite(Date.parse(s.firstFailureAt)) ||
          now - Date.parse(s.firstFailureAt) > config.staleAfter));
    return {
      region,
      name: config.name,
      alert: !!alert,
      state: !valid ? 'invalid-status' : s.state,
      fetchedAt: s?.fetchedAt || null,
      consecutiveFailures: s?.consecutiveFailures ?? null,
    };
  });
}

export async function inspectService(base, fetcher = fetch, now = Date.now()) {
  try {
    const response = await fetcher(`${base}/v1/status`, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    if (!response.ok) throw Error(`Status HTTP ${response.status}`);
    const status = await response.json();
    const checks = assessStatus(status, now);
    // Test the actual feed contract as well as the liveness/status routes.
    for (const check of checks.filter((s) => !s.alert)) {
      try {
        const response = await fetcher(
          `${base}/v1/feed?region=${check.region}&hours=24`,
          { signal: AbortSignal.timeout(20000), cache: 'no-store' },
        );
        const f = response.ok ? await response.json() : null;
        if (
          !f ||
          f.region !== check.region ||
          !Array.isArray(f.incidents) ||
          !Array.isArray(f.warnings) ||
          !Number.isFinite(Date.parse(f.fetchedAt)) ||
          now - Date.parse(f.fetchedAt) > sources[check.region].staleAfter ||
          Date.parse(f.fetchedAt) > now + 120000 ||
          typeof f.stale !== 'boolean'
        ) {
          check.alert = true;
          check.state = 'invalid-feed';
        }
      } catch {
        check.alert = true;
        check.state = 'feed-unavailable';
      }
    }
    return { checkedAt: new Date(now).toISOString(), reachable: true, checks };
  } catch (error) {
    return {
      checkedAt: new Date(now).toISOString(),
      reachable: false,
      checks: [
        {
          region: 'service',
          name: 'Collector / monitoring endpoint',
          alert: true,
          state: 'unavailable',
          reason: String(error.message).slice(0, 200),
        },
      ],
    };
  }
}

export function issuePlan(report, openIssues) {
  const actions = [];
  for (const check of report.checks) {
    const marker = `<!-- dispatch-feed-health:${check.region} -->`;
    const existing = openIssues.filter((i) => i.body?.includes(marker));
    if (check.alert && !existing.length)
      actions.push({ type: 'open', check, marker });
    if (!check.alert)
      for (const issue of existing)
        actions.push({ type: 'recover', issue, check });
  }
  // A reachable service with a valid status contract recovers the service alarm.
  if (report.reachable)
    for (const issue of openIssues.filter((i) =>
      i.body?.includes('<!-- dispatch-feed-health:service -->'),
    ))
      actions.push({ type: 'recover', issue, check: { region: 'service' } });
  return actions;
}

export async function notifyReport(
  report,
  {
    repository = process.env.GITHUB_REPOSITORY,
    token = process.env.GITHUB_TOKEN,
    fetcher = fetch,
  } = {},
) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !token)
    throw Error('GitHub notification configuration missing');
  const api = async (path, method = 'GET', body) => {
    const options = {
      method,
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetcher(
      `https://api.github.com/repos/${repository}${path}`,
      options,
    );
    if (!response.ok)
      throw Error(`GitHub notification HTTP ${response.status}`);
    return response.json();
  };
  const issues = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await api(`/issues?state=open&per_page=100&page=${page}`);
    issues.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
    if (page === 20)
      throw Error('Too many issues to safely deduplicate alerts');
  }
  for (const action of issuePlan(report, issues)) {
    if (action.type === 'open') {
      await api('/issues', 'POST', {
        title: `[Feed alert] ${action.check.name}`,
        assignees: [repository.split('/')[0]],
        body: `${action.marker}\nThe independent collector check detected a problem at ${report.checkedAt}.\n\nRegion: ${action.check.region}\nCondition: ${action.check.state}\nLast successful collection: ${action.check.fetchedAt || 'unavailable'}\nConsecutive failed polls: ${action.check.consecutiveFailures ?? 'unknown'}\n\nSee the Feed health workflow artifact for the check. This issue closes automatically after a healthy check. Empty incident lists are not treated as outages.`,
      });
    } else {
      await api(`/issues/${action.issue.number}/comments`, 'POST', {
        body: `Recovered at ${report.checkedAt}: a fresh check now accepts this source/service. This is an observation time, not the exact recovery time.`,
      });
      await api(`/issues/${action.issue.number}`, 'PATCH', {
        state: 'closed',
        state_reason: 'completed',
      });
    }
  }
}

async function main() {
  const base =
    process.env.FEED_API_URL ||
    'https://incident-feed-production.up.railway.app';
  let report;
  for (let attempt = 0; attempt < 3; attempt++) {
    report = await inspectService(base);
    if (report.reachable) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  mkdirSync('monitor-output', { recursive: true });
  writeFileSync('monitor-output/health.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (process.env.NOTIFY_GITHUB === '1') await notifyReport(report);
  if (report.checks.some((s) => s.alert)) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
