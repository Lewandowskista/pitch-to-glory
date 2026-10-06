# Milestone 6: media, relationships, rival, dressing room, morale and form

## Scope

This milestone covers AGENTS.md §8 (relationships, media, morale and form) and §9.3, 9.4 and 9.6: the rival, dressing-room dynamics and club culture fit. Fame systems, sponsorships, lifestyle, celebrations and challenges belong to milestone 7. Awards, which also compare the player with their rival, belong to milestone 8.

## Design

**Morale and form.**

- Each week the player's morale moves 30% of the way to a target: 50 plus nine bounded parts:
  - recent results;
  - playing time against the role promise;
  - manager trust and fan affection;
  - teammate chemistry and dressing-room mood;
  - culture fit;
  - media coverage;
  - injury or a pending transfer request.
- The parts are stored, so the Club life page shows exactly why morale is moving.
- Form still comes from match ratings. Without a match it drifts back toward 50.
- Both are recorded weekly (up to 160 weeks) and charted, with an accessible table.

**Morale in matches.**

- Key moments now carry a visible "Morale" factor: odds × `1 + (morale − 70) × 0.002`, bounded to ±8%.
- 70 is the average generated morale, so the 10,000-match calibration is unchanged (2.744 goals per match).
- The match engine is now `match-6`; sessions saved by `match-5` are discarded on load with the existing notice.

**Dressing room.**

- The career club's squad is grouped into cliques: senior pros (29+), young guns (22 and under), internationals (when at least three mid-career foreign players) and the core.
- Each clique has a natural leader, an influence (size and leadership) and an affinity: how it regards the player. Affinity is kept when the squad regroups.
- What moves the cliques:
  - performances;
  - press answers, where seniors like humility and young players like confidence;
  - transfer requests;
  - the mood of the room.
- Mood follows recent results and the player's standing.
- Seniors who rate the player raise the manager's trust each week; seniors who don't, lower it.

**Teammates.**

- Relationships with up to six key teammates: the leaders, the player's clique leader and the best players in their line.
- Starting chemistry comes from compatibility: same clique or nationality, sociability, temperament clash and culture fit. The UI shows these reasons.
- Chemistry grows while they share a club, faster when they play together, and follows the regard of the teammate's clique.

**Manager and fans.** The milestone-5 relationship records now also react to performances: great, good and poor ratings, and goals. A new manager starts at 50.

**Club culture fit.**

- A 0–100 score from seven explained parts:
  - ambition against stature and win-now culture;
  - age against youth focus;
  - composure against discipline;
  - loyalty at fan-owned clubs;
  - attributes against the playing style;
  - position against attacking intent;
  - sociability.
- It feeds morale and teammate chemistry. It is shown on Club life, and in transfer talks for the offering club, alongside that club's culture traits (Develops youth, Win-now, Fan-owned, Disciplined, Attacking, playing style).

**Rival.**

- An existing player from the same generation (within a year), in the same line and at a similar level, at another club, preferably in the same country.
- Their potential is set close to the player's, so the careers run side by side.
- The rival is protected from the AI lifecycle like the career player: never retired, released or trimmed, and contracts always renewed.
- In a transfer window, once the rival has outgrown their club, they move to a bigger one for their market value.
- The rival page compares age, club, division, ability, value, season and career numbers, and highest fees.
- The rivalry also tracks:
  - meetings in which the player played;
  - season-by-season lines closed at each rollover;
  - an intensity that rises with meetings, seasons and provocations;
  - a timeline.

**Media.**

- After each match the player plays: a headline and two fan posts toned by rating and result. Journalists comment on outstanding or poor displays.
- The rival posts their goals and replies to provocations. Journalists cover the rival's moves and compare the two every eight weeks.
- At most one press conference or interview is open at a time. Topics: a win, a loss, a goal, being dropped, transfer rumours, a transfer request, a new club, the rival, or a big match next week. The same topic waits six weeks before it is raised again.
- Each answer has a tone and states its effects: fame, manager, dressing room, fans, rivalry and individual cliques.
- Questions are announced in the inbox and lapse after two weeks. Silence costs 1 fame.
- Coverage sentiment decays weekly and feeds morale.

**Persistence.**

- File schema 10 adds `Career.social`, cliques in dressing rooms, the rivalry, the media and teammate relationships. Worlds without a career keep all of them empty.
- Schema 9 careers migrate by gaining a rival, cliques and teammates.
- `socialValidation.ts` checks every record:
  - clique members belong to the club;
  - head-to-head totals add up;
  - answers belong to their question.

**UI** (Tailwind utilities with the shared tokens):

- **Club life** (`/career/club`): morale and form with chart and table, the morale breakdown, dressing room and cliques, key teammates with chemistry and its reasons, manager and fans, and culture fit.
- **Media** (`/career/media`): open questions with effect chips, answered by click or by number keys 1–3. A feed filtered by fans, press, rival or headlines through the URL.
- **Rival** (`/career/rival`): portraits, intensity, the comparison table, meetings, seasons and timeline.
- **Hub**: Press room and Rival watch cards.
- **Transfer talks**: culture fit for the offering club.
- **Inbox**: links to the media room and rival page.

## Implementation checklist

- [x] Pure social engine: rules, dressing room, rival, media, weekly step, rollover, actions; morale match factor (`match-6`).
- [x] Lifecycle protection for the rival; hooks in the weekly step, rollover, commit path and moves.
- [x] Schema 10, migration and validation.
- [x] Club life, Media and Rival screens; hub cards; talks fit; navigation, routes, i18n, keyboard and screen-reader support.
- [x] 14 social unit tests, and a three-browser social journey with axe checks and phone-width checks.
- [x] Docs.

## Known limits

- The rival's matches are background matches; the rival has no interactive key moments.
- Cliques and chemistry are modelled for the career player's current club only. Other clubs keep a static mood and no cliques.
- Press topics come from a fixed catalogue with three answers each; wording varies, but structure does not.
