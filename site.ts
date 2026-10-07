/** The default public address, used when the build has no `SITE_URL`. */
export const DEFAULT_SITE_URL = 'https://pitch-to-glory.pages.dev';

/**
 * The public address for share tags and the canonical link, from `SITE_URL` at build time.
 * The build and the release tests both read it here, so the tests check the build against
 * the configured address rather than against its own output.
 */
export function siteUrl(value = process.env.SITE_URL): string {
  const url = (value?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+(\/[^\s]*)?$/.test(url))
    throw new Error(`SITE_URL must be an absolute http(s) address, not "${value}"`);
  return url;
}
