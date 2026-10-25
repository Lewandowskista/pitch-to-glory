// Creates or updates the analytics dashboards in PostHog from docs/ANALYTICS.md: every
// "### … dashboard" heading is a dashboard, every "####" heading under it an insight whose query
// is the ```sql block that follows. Run locally, never in CI:
//
//   npm run analytics:dashboards              create or update
//   npm run analytics:dashboards -- --dry-run print what would change, without the network
//
// Needs POSTHOG_PERSONAL_API_KEY (a personal API key with dashboard and insight write access)
// and POSTHOG_PROJECT_ID, from the environment or .env.local, which is never committed.
import { existsSync, readFileSync } from 'node:fs';

const API = 'https://eu.posthog.com';
const PREFIX = 'Pitch to Glory · ';
const dryRun = process.argv.includes('--dry-run');

interface Insight {
  name: string;
  description: string;
  query: string;
}
interface Dashboard {
  name: string;
  insights: Insight[];
}

/** The dashboards defined in docs/ANALYTICS.md. */
export function readDashboards(markdown: string): Dashboard[] {
  const dashboards: Dashboard[] = [];
  const sections = markdown.split(/^### /m).slice(1);
  for (const section of sections) {
    const title = /^(.+) dashboard\s*$/m.exec(section.split('\n')[0]!)?.[1];
    if (!title) continue;
    const insights: Insight[] = [];
    for (const part of section.split(/^#### /m).slice(1)) {
      const [heading, ...rest] = part.split('\n');
      const body = rest.join('\n');
      const query = /```sql\n([\s\S]*?)```/.exec(body)?.[1]?.trim();
      if (!heading || !query) continue;
      const description = body.slice(0, body.indexOf('```sql')).replace(/\s+/g, ' ').trim();
      insights.push({ name: heading.trim(), description, query });
    }
    dashboards.push({ name: `${PREFIX}${title.trim()}`, insights });
  }
  return dashboards;
}

async function main(): Promise<void> {
  if (process.env.CI) throw new Error('analytics:dashboards runs locally only, never in CI.');
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const dashboards = readDashboards(readFileSync('docs/ANALYTICS.md', 'utf8'));
  if (!dashboards.length) throw new Error('No dashboards found in docs/ANALYTICS.md');
  if (dryRun) {
    for (const dashboard of dashboards) {
      console.log(`${dashboard.name}`);
      for (const insight of dashboard.insights) console.log(`  - ${insight.name}`);
    }
    return;
  }
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  if (!key || !project)
    throw new Error('Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID (in .env.local).');
  const base = `${API}/api/projects/${encodeURIComponent(project)}`;
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return (await response.json()) as T;
  }
  type Listed = { id: number; name: string; dashboards?: number[]; deleted?: boolean };
  async function list(path: string): Promise<Listed[]> {
    const results: Listed[] = [];
    let next: string | null = path;
    while (next) {
      const page: { results: Listed[]; next: string | null } = await call('GET', next);
      results.push(...page.results);
      next = page.next ? page.next.slice(page.next.indexOf(base) + base.length) : null;
    }
    return results;
  }

  const existing = await list('/dashboards/?limit=100');
  for (const dashboard of dashboards) {
    let target = existing.find((entry) => entry.name === dashboard.name && !entry.deleted);
    if (!target) {
      target = await call<Listed>('POST', '/dashboards/', {
        name: dashboard.name,
        description: 'Defined in docs/ANALYTICS.md; updated by npm run analytics:dashboards.',
      });
      console.log(`Created dashboard ${dashboard.name}`);
    } else console.log(`Updating dashboard ${dashboard.name}`);
    const insights = (await list('/insights/?saved=true&limit=100')).filter((entry) =>
      entry.dashboards?.includes(target.id),
    );
    for (const insight of dashboard.insights) {
      const payload = {
        name: insight.name,
        description: insight.description,
        query: {
          kind: 'DataVisualizationNode',
          source: { kind: 'HogQLQuery', query: insight.query },
        },
        saved: true,
      };
      const found = insights.find((entry) => entry.name === insight.name && !entry.deleted);
      if (found) await call('PATCH', `/insights/${found.id}/`, payload);
      else await call('POST', '/insights/', { ...payload, dashboards: [target.id] });
      console.log(`  ${found ? 'Updated' : 'Created'} ${insight.name}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
