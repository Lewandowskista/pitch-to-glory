# Milestone 7: fame, sponsorships, lifestyle, wardrobe, celebrations and challenges

## Scope

AGENTS.md §8 (fame and lifestyle, celebrations) and §9.8 (daily and weekly challenges with cosmetic rewards). National teams, continental cups, awards, retirement, legacy, the Chronicle and Moments belong to milestone 8 and are not started.

## Design

**Fame levels.**

- `career.fame`, which matches, the press and celebrations already move, maps to ten levels: Unknown, Local talent, Rising name, Regional star, National name, Hot prospect, Star, Superstar, Icon, Legend.
- Levels unlock looks, sponsors and purchases. A level-up arrives in the inbox.
- The Lifestyle page shows progress to the next level and what it unlocks.

**Sponsorships.**

- From fame level 2, brands make offers through the inbox. There are ten fictional brands in six categories, each with a minimum level. The number of deals you can hold depends on your fame level.
- A deal pays a weekly fee (scaled by fame level and brand) to the end of the season, and a bonus of eight weeks' fee if every obligation is met.
- Obligations suit the position:
  - always: start a number of matches;
  - by position: goals, clean sheets, or an average rating;
  - by brand: wear their boots (boots brands), answer press questions (drinks and apparel), or keep fan affection up (watches, cars, tech).
- A completed deal adds fame; a failed one costs fame. Taking off a boots sponsor's boots ends that deal at once.
- Agents take their commission on fees and bonuses.

**Lifestyle.**

- Cars and homes in four tiers each (fame-gated) lift morale through a new "Home and car" morale part: best car plus best home, within ±8.
- Upkeep comes out of savings weekly. Upkeep above half the wage costs morale. If savings cannot cover upkeep, the most valuable item is sold, with an inbox message.
- Three investments (bond, property fund, start-up stake) move weekly with seeded, deterministic returns of rising risk. Cars and homes resell at 60%; investments sell at their value.

**Wardrobe.**

- Hairstyle and accessory (eight each), hair colour and facial hair change the player's own avatar.
- Kit choices are sleeve length, socks (five styles), the captain's armband (four styles) and boots (eight designs, plus sponsor boots while sponsored).
- Items unlock by fame level, or earlier with style tokens. Your starting look is always yours. Hair colour, facial hair and sleeves are free.
- The preview renders the club's home shirt with your sleeves and armband, plus your socks and boots, as original SVG.

**Celebrations.**

- Twelve celebrations, each with a motion: pose, wave, slide, dance, sprint, spin or flip. The first two are free.
- The signature celebration plays on the pitch after the career player's goals: the Pixi token animates, and the SVG fallback uses the same motions in CSS. A commentary line names it.
- In a cup tie, play-off or final (importance 1.15 or more), each goal celebrated this way adds 2 fame. The match report shows it.
- Reduced motion keeps the line but skips the animation. The match engine is unchanged (`match-6`): the celebration lives in the presentation layer, and the fame is added on the single commit path.

**Challenges.**

- Three daily and three weekly challenges follow the real calendar (the local day and its ISO week), so they reward coming back.
- Kinds: play, win, score, assist, keep clean sheets, earn 7.0+ ratings, answer the press, play through weeks, earn XP. Defenders and keepers get clean sheets instead of goals.
- Progress counts from when the challenge was issued.
- Rewards are style tokens (10 daily, 40 weekly), and sometimes a locked cosmetic on weekly challenges. Rewards are cosmetic only: nothing that changes a match, morale or money.
- Claiming plays a reward animation. A new day or week replaces the old set.

**Persistence.**

- File schema 11 adds `Career.style` (tokens, owned and equipped cosmetics, fame level, signature uses, assets) and fills `World.sponsorships` and `World.challenges` for careers.
- Schema 10 careers migrate with the starting style and a lifestyle morale part of 0.
- `lifestyleValidation.ts` checks every record. Notably, sponsor boots can only be worn while that sponsor is active.

**UI:**

- Lifestyle (`/career/lifestyle`): fame with an animated level badge, sponsor offers and deals with obligation progress, savings, upkeep, owned items and the shop.
- Wardrobe and celebrations (`/career/wardrobe`): preview, look and kit choices with lock states, celebration previews, challenges with claim animations.
- Hub: a Fame and challenges card.
- Match: the signature celebration and its commentary line.
- Report: the fame from celebrations.
- Challenges refresh whenever the career is open.

## Implementation checklist

- [x] Pure lifestyle engine (catalogue, fame, wardrobe, sponsors, assets, challenges, week, actions); hooks in the weekly step, rollover and commit path; lifestyle morale part.
- [x] SVG gear artwork; Pixi and CSS celebration motions with reduced-motion support.
- [x] Schema 11, migration and validation.
- [x] Lifestyle and Wardrobe screens, hub card, match and report integration, navigation, routes and i18n.
- [x] 15 lifestyle unit tests, and a three-browser lifestyle journey with axe checks and phone-width checks.
- [x] Docs.

## Known limits

- Hairstyles and accessories are named by number ("Hairstyle 5"), with a portrait preview for each.
- Celebrations are seen only in interactive matches. Auto-played matches still award the signature fame.
- The captain's armband shows in the wardrobe preview; pitch tokens do not show kit details.
