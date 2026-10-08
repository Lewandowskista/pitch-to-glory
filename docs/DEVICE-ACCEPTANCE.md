# Device acceptance

Manual checks on physical devices before a release that changes storage, offline behaviour,
audio, input or rendering (Phase 4.2 of the [improvement plan](superpowers/plans/2026-10-07-high-value-improvements.md)).
Automated browser engines cannot stand in for these: a result counts only when a person has
run it on the named device, and records the date, build and anything that went wrong.

## Devices

| Device                  | Browser                     | Why                                                |
| ----------------------- | --------------------------- | -------------------------------------------------- |
| Mac (Apple silicon)     | Safari, current             | WebKit storage, audio and service-worker behaviour |
| iPhone (two years old)  | Safari, current iOS         | Storage eviction, background suspension, touch     |
| Mid-range Android phone | Chrome, current             | The 4G/CPU profile the performance budgets assume  |
| Windows or Linux laptop | Chrome or Edge, and Firefox | The desktop layout and keyboard play               |

## Checks

Use a career save with at least one completed season (`npm run perf:fixtures` writes one to
`artifacts/performance/late.json`; import it from the Saves screen).

1. **Storage under pressure.** Import the late-career save. Confirm the persistence prompt
   explains why. Fill the device's storage with other data, reopen the game and confirm the
   save is still listed, or that export reminders appeared first.
2. **Install and offline.** Install the game (Add to Home Screen or the install button), open
   it once online, enable airplane mode, then open it again, load the career, continue a week
   and play a key moment.
3. **Update.** With the installed game open on a career, deploy a new build. Accept "Save &
   update" and confirm the career is at the same week afterwards.
4. **Audio unlock.** Open the game with sound on. No sound plays before the first tap or key;
   after it, interface sounds and the match crowd play, and mute silences them at once.
5. **Background and resume.** During a live match, switch apps for a minute and return. The
   match is paused on return and continues correctly; a week in progress resumes or finishes
   without losing progress.
6. **Large text.** Set text size to 130% in Settings and the system's largest text. The hub's
   main action, the bottom tab bar and key-moment choices stay readable and reachable without
   sideways scrolling.
7. **Touch decisions.** Play a match by touch only: tap a choice to see its breakdown, tap to
   choose; long-press shows help where hovering would. Nothing needs a keyboard.
8. **Sustained rendering.** Play a full match at 1× on the live pitch. Note dropped frames,
   heat and battery use; the pitch should stay smooth (aim: 60 fps on the laptop and phone).

## Results

Fill in one row per device and check. Leave a result blank until it has been run on that
device; "Pass" needs the build (commit) it was run against.

| Date | Build | Device and browser | Checks run | Result and notes |
| ---- | ----- | ------------------ | ---------- | ---------------- |
|      |       |                    |            | Not yet run      |
