# Deploying Pitch to Glory

The game is a static site. It is built and tested by GitHub Actions and published to **Cloudflare Pages** on the free plan. Both are free for this public repository: GitHub Actions has no minute limit for public repositories, and Cloudflare Pages' free plan has no bandwidth limit.

## How the pipeline runs

`.github/workflows/ci.yml` runs on every push to `main`, on pull requests, and on demand.

1. **verify** (Linux): `npm ci`, Prettier, ESLint, unit tests, one national season of headless career play with its end-of-season checks (`npm run soak -- --seasons 1`), then `npm run build`, which runs the strict typecheck and the per-route bundle budget. The built `dist/` is kept as an artifact.
2. **browsers** (Windows, one job each for Chromium, Firefox and WebKit, in parallel): the Playwright journeys against that exact build, served with the production headers. The Chromium job also builds a second release and replaces the first under a saved career (`npm run test:update`). Windows runners are used because Linux WebKit runners have no GPU and crash in the WebGL match renderer.
3. **deploy** (pushes to `main` only, after both pass): uploads `dist/` to the Cloudflare Pages project `pitch-to-glory` with Wrangler. It creates the project on the first deploy. Until the two secrets below exist, this job reports a notice and skips, without failing.

Pull requests run the checks but never deploy. Each browser test gets one retry: a test that fails twice blocks the deploy, while one that passes on retry shows as a warning on the run to fix without blocking it. Browser errors from loads a navigation cancelled are ignored (`isAbortedLoad` in `e2e/support.ts`); every other console or page error fails the test.

Two scheduled workflows run longer checks off the critical path and keep their reports as artifacts:

- `.github/workflows/endurance.yml`: five seasons of one career every night, run twice to prove the seed reproduces, and two full careers (retirement, then the child's career) every Sunday (`npm run soak`).
- `.github/workflows/performance.yml`: every Saturday, career saves from `npm run perf:fixtures`, timed journeys with frame pacing and interaction latency (`npm run test:performance`), and Lighthouse on loaded career pages (`npm run audit -- --populated`).

Both can be started from the **Actions** tab.

## One-time setup

1. **Account ID.** In the Cloudflare dashboard, open **Workers & Pages**. The Account ID is shown in the right-hand column (it is also the hex string in the dashboard URL).
2. **API token.** Go to **My Profile → API Tokens → Create Token → Create Custom Token**:
   - Name: `pitch-to-glory deploy`.
   - Permissions: **Account → Cloudflare Pages → Edit**.
   - Account Resources: **Include → your account**.
   - Create the token and copy it; Cloudflare shows it once.
3. **Repository secrets.** Never paste the token into chats or files. In a terminal in the project folder (each command prompts for the value and hides it):

   ```sh
   gh secret set CLOUDFLARE_API_TOKEN --repo Lewandowskista/pitch-to-glory
   gh secret set CLOUDFLARE_ACCOUNT_ID --repo Lewandowskista/pitch-to-glory
   ```

   Or use **GitHub → repository Settings → Secrets and variables → Actions → New repository secret**.

4. **Deploy.** Push to `main`, or run the workflow from the **Actions** tab (**Validate and deploy → Run workflow**). The first deploy creates `https://pitch-to-glory.pages.dev` if the name is free. If Cloudflare assigns a different address, set it in the two places below.

## The site address

Share tags and the canonical link need the absolute address. It defaults to `https://pitch-to-glory.pages.dev` and comes from `SITE_URL` at build time (`vite.config.ts`). To use a custom domain:

1. Add the domain to the Pages project in Cloudflare (**Custom domains**); Cloudflare guides the DNS step.
2. Add a repository variable `SITE_URL` (**Settings → Secrets and variables → Actions → Variables**) with the address, for example `https://your.domain`. The workflow passes it to the build, to the browser journeys (whose release check compares every share tag and the canonical link with it) and to the deploy job's environment URL. Leave it unset for the default address.

Locally, build with `SITE_URL=https://your.domain npm run build` then run `npx playwright test e2e/release.spec.ts` with the same variable set. `npm run test:release:custom` builds a separate custom-domain copy into `dist-custom` (on preview port 4174) and runs the release journey against it, without touching `dist`; set `CUSTOM_SITE_URL` to try another address. CI runs it on every push.

## What the host serves

- `public/_headers` sets the production headers: a strict Content Security Policy (same-origin scripts, no `eval`; `data:` and `blob:` only for images, audio, exports and workers), `nosniff`, `X-Frame-Options: DENY`, a referrer policy and a permissions policy; long-lived caching for fingerprinted `/assets/*`; and `no-cache` for the service worker and manifest so updates are noticed. `vite preview` applies the same file, so every browser test runs under these headers.
- There is no `404.html`, so Cloudflare Pages serves `index.html` for unknown paths. Every in-game URL works on refresh.
- `netlify.toml` remains as a fallback host configuration; Netlify reads the same `_headers` file.

## Rolling back

In Cloudflare, open the project's **Deployments** list and use **Rollback** on an earlier production deployment. Every deployment records its commit.

## Before a release

```sh
npm ci
npm run format:check && npm run lint && npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
npm run audit          # Lighthouse: mobile > 85, desktop > 90, accessibility > 95
npm run soak -- --seasons 5 --repeat   # long careers, reproducibility and save size
npm run perf:fixtures && npm run test:performance && npm run audit -- --populated-only
```

Physical-device checks are manual: see [DEVICE-ACCEPTANCE.md](DEVICE-ACCEPTANCE.md).

Run `npm run raster` after changing `public/share.svg`, `public/icon.svg` or `public/icon-maskable.svg`, and commit the regenerated PNGs.
