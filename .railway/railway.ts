import { defineRailway, github, project, service, volume } from 'railway/iac';
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = 'incident-feed';
export default defineRailway(() => {
  // The SQLite database (live store and the website's history) lives on this
  // volume. It must stay mounted at /data: without it every deploy starts
  // with an empty database.
  const data = volume('incident-feed-volume', {
    sizeMB: 50000,
    region: 'us-west2',
  });

  const incidentFeed = service('incident-feed', {
    source: github('chrisschepers/dispatch-au', {
      branch: 'main',
      checkSuites: false,
    }),
    build: {
      buildEnvironment: 'V3',
      builder: 'DOCKERFILE',
      dockerfilePath: 'Dockerfile',
    },
    healthcheck: '/health',
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 },
    replicas: { 'us-west2': 1 },
    domains: ['emergenciesnearme.online', 'www.emergenciesnearme.online'],
    volumeMounts: { '/data': data },
  });

  // The variables (secrets among them) stay as they are on Railway. The CLI
  // reads `variables`, but the SDK's ProjectDefinition type (railway 3.16.0)
  // does not list it, so it goes in through a variable instead of a literal.
  const definition = {
    variables: { managed: false },
    resources: [incidentFeed],
  };
  return project('Dispatch', definition);
});
