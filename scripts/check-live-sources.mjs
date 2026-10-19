import { fetchSource, sources } from '../backend/feeds.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { notifyReport } from './check-feed-health.mjs';
const checks = await Promise.all(
  Object.keys(sources).map(async (region) => {
    try {
      let f;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          f = await fetchSource(region);
          if (f.stale) throw Error('Source snapshot or HTTP clock is stale');
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      if (f.stale) throw Error('Source snapshot or HTTP clock is stale');
      return {
        region,
        ok: true,
        incidents: f.incidents.length,
        warnings: f.warnings.length,
      };
    } catch (error) {
      return { region, ok: false, error: String(error.message).slice(0, 200) };
    }
  }),
);
mkdirSync('monitor-output', { recursive: true });
const report = { checkedAt: new Date().toISOString(), checks };
writeFileSync('monitor-output/contracts.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (process.env.NOTIFY_GITHUB === '1')
  await notifyReport({
    checkedAt: report.checkedAt,
    reachable: false,
    checks: checks.map((check) => ({
      region: `contract-${check.region}`,
      name: `${sources[check.region].name} source format`,
      alert: !check.ok,
      state: check.ok ? 'healthy' : 'source-contract-failed',
    })),
  });
if (checks.some((s) => !s.ok)) process.exitCode = 1;
