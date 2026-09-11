import { env } from 'cloudflare:workers';
export function db(): D1Database {
  if (!env.DB) throw Error('Database unavailable');
  return env.DB;
}
export function setting(name: string): string {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}
