import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessStatus,
  inspectService,
  issuePlan,
  notifyReport,
} from '../scripts/check-feed-health.mjs';
const now = Date.parse('2026-10-19T19:00:00Z');
const healthy = () => ({
  checkedAt: new Date(now).toISOString(),
  sources: ['sa', 'vic', 'act', 'nsw', 'qld'].map((region) => ({
    region,
    ready: true,
    stale: false,
    alert: false,
    consecutiveFailures: 0,
    state: 'healthy',
    fetchedAt: new Date(now).toISOString(),
  })),
});
void test('external watchdog detects a lying/frozen status endpoint and missing regions without using incident counts', () => {
  assert.ok(assessStatus(healthy(), now).every((s) => !s.alert));
  const s = healthy();
  s.sources.find((s) => s.region === 'vic').fetchedAt = new Date(
    now - 300001,
  ).toISOString();
  assert.equal(
    assessStatus(s, now).find((s) => s.region === 'vic').alert,
    true,
  );
  s.sources = s.sources.filter((s) => s.region !== 'sa');
  assert.equal(assessStatus(s, now).find((s) => s.region === 'sa').alert, true);
  assert.throws(() =>
    assessStatus(
      { ...s, checkedAt: new Date(now - 120001).toISOString() },
      now,
    ),
  );
});
void test('isolated poll failures do not alert immediately, repeated failures do', () => {
  const s = healthy();
  Object.assign(s.sources[0], {
    stale: true,
    consecutiveFailures: 1,
    state: 'delayed',
  });
  assert.equal(assessStatus(s, now)[0].alert, false);
  s.sources[0].consecutiveFailures = 3;
  assert.equal(assessStatus(s, now)[0].alert, true);
});
void test('HTTP-200 HTML and unreachable services cannot pass; valid empty lists pass', async () => {
  const good = async (url) =>
    new Response(
      JSON.stringify(
        url.endsWith('/v1/status')
          ? healthy()
          : {
              region: new URL(url).searchParams.get('region'),
              incidents: [],
              warnings: [],
              stale: false,
              fetchedAt: new Date(now).toISOString(),
            },
      ),
    );
  assert.ok(
    (await inspectService('https://example.test', good, now)).checks.every(
      (s) => !s.alert,
    ),
  );
  const bad = await inspectService(
    'https://example.test',
    async () => new Response('<html>Unavailable</html>'),
    now,
  );
  assert.equal(bad.reachable, false);
  assert.equal(bad.checks[0].alert, true);
});
void test('outage issues deduplicate, recover once, and regional issues remain open while the whole service is unreachable', () => {
  const issue = { number: 12, body: '<!-- dispatch-feed-health:vic -->' };
  const failure = { reachable: true, checks: [{ region: 'vic', alert: true }] };
  assert.equal(issuePlan(failure, []).length, 1);
  assert.equal(issuePlan(failure, [issue]).length, 0);
  assert.equal(
    issuePlan({ reachable: true, checks: [{ region: 'vic', alert: false }] }, [
      issue,
    ])[0].type,
    'recover',
  );
  assert.deepEqual(
    issuePlan(
      { reachable: false, checks: [{ region: 'service', alert: true }] },
      [issue],
    ).map((a) => a.type),
    ['open'],
  );
});

void test('notification delivery assigns the owner and posts a recovery before closing; API failures surface', async () => {
  const requests = [];
  let existing = [];
  const options = {
    repository: 'owner/dispatch',
    token: 'test-only-token',
    fetcher: async (url, init) => {
      requests.push({
        url,
        method: init.method,
        body: init.body ? JSON.parse(init.body) : null,
      });
      return new Response(
        JSON.stringify(init.method === 'GET' ? existing : { number: 42 }),
      );
    },
  };
  await notifyReport(
    {
      checkedAt: 'test-time',
      reachable: true,
      checks: [
        { region: 'vic', name: 'Victoria', alert: true, state: 'delayed' },
      ],
    },
    options,
  );
  assert.deepEqual(requests[1].body.assignees, ['owner']);
  assert.match(requests[1].body.body, /dispatch-feed-health:vic/);
  existing = [{ number: 42, body: requests[1].body.body }];
  requests.length = 0;
  await notifyReport(
    {
      checkedAt: 'test-time',
      reachable: true,
      checks: [{ region: 'vic', alert: false }],
    },
    options,
  );
  assert.match(requests[1].url, /issues\/42\/comments$/);
  assert.match(requests[1].body.body, /Recovered/);
  assert.deepEqual(requests[2].body, {
    state: 'closed',
    state_reason: 'completed',
  });
  await assert.rejects(
    () =>
      notifyReport(
        { checks: [] },
        {
          ...options,
          fetcher: async () => new Response('{}', { status: 403 }),
        },
      ),
    /HTTP 403/,
  );
});
