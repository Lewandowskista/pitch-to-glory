# Releasing

Every push to `main` is a release. CI builds and tests it, then deploys it to Cloudflare Pages
([deploying](DEPLOY.md)), and players get it the next time the game checks for an update. So
every push to `main` carries a version number and player-facing patch notes.

## Versions

`package.json`'s `version` is the release version. Vite injects it at build time as
`__APP_VERSION__`, which `src/release/version.ts` exports as `APP_VERSION`. It shows in three
places:

- Settings, in the About card, with a link to What's new.
- The clubhouse (the main menu), at the foot of the page.
- The "Updated to x.y.z · See what's new" notice. It appears once, when the game starts on a
  newer version than this browser last saw.

Versions are plain `major.minor.patch` ([semver](https://semver.org)), with no pre-release tags:

| Bump                | When                                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Patch** (`0.2.1`) | Fixes, copy changes and balance tweaks. Nothing new for players to learn.                                                                                                               |
| **Minor** (`0.3.0`) | New features, screens or systems, and anything players would want to read about.                                                                                                        |
| **Major** (`1.0.0`) | Only for breaking save changes: a save from the previous version can no longer be loaded or migrated. A save schema bump with a migration is not breaking, so it does not need a major. |

Several merges can share one version until it ships. Bump once per push to `main`, not once
per commit.

## Adding a release

1. **Write the notes.** Add an entry at the **top** of `PATCH_NOTES` in
   `src/i18n/patchNotes.ts`:

   ```ts
   {
     version: '0.2.1',
     date: '2026-10-20', // the day it reaches main, YYYY-MM-DD
     title: 'Sharper finishing',
     summary: 'One sentence a player would want to read.',
     new: ['…'],
     improved: ['…'],
     fixed: ['…'],
   },
   ```

   Leave out the sections you do not need. A section you include cannot be empty.

2. **Bump the version** in `package.json` and in the root of `package-lock.json` (both the
   top-level `version` and `packages[""].version`), or run
   `npm version 0.2.1 --no-git-tag-version`, which updates both.
3. **Regenerate the changelog** with `npm run changelog`, which rewrites `CHANGELOG.md` from the
   notes. Never edit `CHANGELOG.md` by hand.
4. **Check** with `npm run check:release`, then commit the notes, both package files and
   `CHANGELOG.md` together.

To add lines to a release that has not shipped yet, edit its entry, then run steps 3 and 4.
Leave the version and date alone unless the release day changes.

## Writing patch notes

- Write for players: what they will see, feel or be able to do. Use British English, as the rest
  of the game's copy does.
- One concrete line per change, ideally under 25 words. Start with the thing that changed.
- Never mention code names, internal milestone or phase numbers, engine versions, or file names.
  The release check rejects the obvious cases.
- Put each change in the right section. **New** is something players could not do or see
  before. **Improved** is something that works better. **Fixed** is something that was wrong.
- Mention save effects players will notice, for example a match in progress that restarts
  after the update.

## The release gate

`npm run check:release` (`scripts/check-release.ts`) runs in the `checks` job of
`.github/workflows/ci.yml`, next to Prettier and ESLint. It fails when:

- `package.json`'s version has no patch-notes entry, or is not the newest entry;
- versions are not valid `major.minor.patch`, unique and strictly newest first;
- a date is not a real `YYYY-MM-DD` date, or is older than the release after it;
- an entry has an empty title or summary, or no sections; a section is empty; a line is blank;
- a line uses internal wording (a milestone or phase number, an engine version, a file name);
- `CHANGELOG.md` does not match the notes.

The same rules run as unit tests in `tests/release.test.ts`.

## Where the notes show

- **What's new** (`/whats-new`) lists every release, newest first. The newest is open, and older
  releases sit behind disclosures. It is linked from Settings, the clubhouse and the "Updated"
  notice, and is not in the main navigation. The screen is its own lazy chunk, so the notes
  never load with the app shell. `npm run build` fails if they do (`scripts/check-bundle.mjs`).
  The service worker precaches the chunk, so it works offline.
- **CHANGELOG.md** at the repository root, generated from the same data.

The last version a browser has seen is stored under `ptg-last-version` in `localStorage`. A
first visit stores the current version and shows no notice. After an update, the notice shows
until the player dismisses it or opens What's new. It never shows over a key moment's choices,
and it waits behind the service worker's own prompts. If storage is unavailable, the notice
never shows and nothing breaks.
