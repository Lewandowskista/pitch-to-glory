# Milestone 5: contracts, agents, transfers and loans

## Scope

AGENTS.md §8 (contracts, agents, transfers and loans) and milestone 5: the career player's contract and squad-role promise, agents, scouting interest, club-to-club bids, multi-step negotiation with counter-offers, loans, transfer requests, renewals and free transfers. Media, relationships beyond manager trust and fan affection, the rival, dressing-room dynamics and morale systems belong to milestone 6 and are not started.

## Design

**Contract.** The career player's contract carries:

- a wage and a length;
- a squad role promise: Key player, Rotation, Backup or Youth prospect;
- appearance, goal and clean-sheet bonuses (the clean-sheet bonus applies to keepers and defenders);
- a release clause and a sell-on clause owed to the selling club;
- a loyalty bonus, paid when the contract runs its course, or when the player is sold without having asked to leave.

A trial now earns a rotation contract priced from the player's real starting ability.

**Selection.** The role promise decides matchday selection.

- Each fixture is a seeded draw against a probability made of:
  - the role's base chance;
  - the player's place among teammates in their line (goalkeepers, defenders, midfielders, attackers);
  - form, a fatigue penalty and the manager's trust.
- A key-player promise keeps the chance at 90% or more.
- An unpicked player's fixture is simulated in the background without them.
- The player starts more often as they outgrow the squad.
- Starts against the promise are tracked each season. A broken promise is flagged and makes a transfer request cost less trust.

**Scouting interest.**

- Clubs at or above the player's club, whose first team the player could join, start watching. The chance rises with recent ratings, the division's visibility and the agent's network. Clubs abroad are less likely.
- Confidence grows weekly with performance. Clubs move from watching to scouting to ready to bid, the last after several weeks of observation.
- A player who asked for a loan, or a youth or backup player who is rarely picked, also attracts smaller domestic clubs for loans.

**Windows and offers.**

- Two windows per season: summer (first 13% of weeks) and winter (47–55%). National worlds: weeks 1–8 and 29–33. Compact worlds: weeks 1–5 and 16–19.
- In a window, ready clubs bid. The selling club accepts its asking price: market value × a factor by role, lower after a transfer request. It must accept a bid that meets the release clause.
- A buyer bids at most twice, within its transfer budget.
- An accepted fee opens personal-terms talks with the player.
- Loan offers come with a role promise, a wage share and sometimes an option to buy.
- In a final contract season, clubs can offer pre-contracts from the winter window on. These are free moves at the season change.
- The current club offers renewals in a final season, or improved terms when the player has outgrown the contract. The player can also ask for a new contract.

**Negotiation.**

- The club opens with terms: wage, length, role, release clause and signing-on fee. It keeps private limits: maximum wage, the best role it will promise, a range of lengths, a minimum release clause (big clubs refuse clauses) and a maximum signing-on fee.
- The player accepts, walks away, or counters. The club's answer is deterministic and the reasons are shown:
  - terms within its limits are accepted;
  - a wage more than 30% above its ceiling, or one more demand once its patience is gone, ends the talks;
  - otherwise it meets the player halfway on each item it cannot accept.
- Offers made by the weekly simulation arrive with the following week. They lapse after three weeks (four for renewals and pre-contracts), and transfer and loan offers never outlive their window.

**Agents.**

- A seeded pool of eight agents of three kinds:
  - aggressive negotiators: high negotiation, 10–12% commission, push for moves;
  - well-connected: high network, 7–9%, bring more clubs, including abroad;
  - cheap: 3–5%.
- Better agents only take clients whose standing (ability, club stature and fame) is high enough.
- An agent stretches the club's limits, earns one more counter-offer when skilled, and shows an estimate of the wage ceiling whose accuracy depends on skill.
- Agents also bring clubs to watch the player and advise on transfer requests and new contracts.
- The commission comes off wages, bonuses, signing-on fees and loyalty bonuses.
- Changing agent has a four-week cooldown and waits until open talks are finished.

**Transfer requests and relationships.**

- A transfer request:
  - costs manager trust (−15, or −5 after a broken promise) and fan affection (−10);
  - lowers the asking price to 85%;
  - speeds up interested clubs;
  - forfeits the loyalty bonus.
- Withdrawing it restores part of that.
- Manager trust and fan affection per club are stored as `Relationship` records and shown on the Transfers page. A new manager starts at 50. Milestone 6 extends relationships to teammates and media.

**Moves.**

- A transfer pays the fee, minus any sell-on share owed to an earlier club, and starts the new contract. A young player's new contract owes the selling club 10% of the next fee.
- The player is registered from the following week, so they cannot play twice in one week.
- A loan moves the registration; the contract stays with the parent club, which pays the rest of the wage. The loan ends at the season change, and a loan club with an option to buy may make it permanent after a good loan.
- An expired contract without a new deal is extended by the club's one-season option.
- A club dropping below the simulated frontier still relocates the player, now recorded as a move with an inbox message.

**Money.** Wages are paid weekly into the player's savings, with bonuses earned since the last pay day, less the agent's commission. Lifetime earnings and agent fees are tracked for milestone 7's lifestyle purchases.

**Inbox.** Market events arrive as localized messages: offers, rejected bids, lapses, completed moves, agent advice, being left out, broken promises and new managers. Messages with an open offer link straight to the talks. Old read messages are dropped beyond 200.

**Persistence.**

- File schema 9 adds `Career.market` and fills `World.agents`, `scouting`, `offers`, `negotiations`, `loans`, `relationships` and `inbox` for career worlds. Worlds without a career keep them empty.
- Schema 8 careers migrate by gaining an empty market, the agent pool and relationships with their current club.
- Validation checks every record against the world (see ARCHITECTURE.md).

**UI** (Tailwind utilities with the shared tokens):

- **Transfers and contract** (`/career/transfers`):
  - window status, the contract and its clauses, playing time and the chance of starting the next match;
  - manager trust and fan affection, earnings;
  - requests: new contract, transfer request with confirmation, loan request;
  - offers, the talks view (`?offer=`, closed by browser back), scouting interest and career moves.
- **Agent** (`/career/agent`): the current agent, standing, and the pool with hire and release.
- **Inbox** (`/career/inbox`): messages with arrow-key navigation, and a reader (`?message=`) that marks a message read.
- **Hub**: market and latest-messages cards. The career nav shows the unread count.

## Implementation checklist

- [x] Market rules, selection, scouting, offers, negotiation, moves, payroll and agents in a pure engine module; weekly and rollover hooks; single commit path kept.
- [x] Schema 9, migration and validation; save round-trip and forgery tests.
- [x] Transfers, Agent and Inbox screens; hub cards; navigation, routes, i18n, keyboard and screen-reader support.
- [x] 19 market unit tests; a three-browser Playwright market journey with axe checks in both themes and phone-width overflow checks.
- [x] Docs: architecture, balancing, decisions, verification, README and handoff.

## Known limits

- AI clubs still trade among themselves through the existing like-for-like exchanges, without fees or negotiations. The full market applies to the career player.
- Loans last until the end of the season and cannot be recalled early.
- Relationship values change only through the market's own events for now. Milestone 6 adds performance, media and dressing-room effects.
