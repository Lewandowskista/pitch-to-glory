# Football world realism

New worlds use `national-v1` with identity version 2: the six real countries with source-based national pyramids, real towns, and fictional clubs and competitions that reference their real counterparts (see [Identities](#identities)). Worlds generated before identity version 2 keep their fictional countries and names. Initial generation contains 52 league groups, 959 clubs, 21,098 players and seven domestic cups. These are initial counts; feeder admissions and regional capacity changes can alter later totals. This revision remains within milestone 2. Interactive matches, continental competitions and career creation belong to later milestones.

## Reference policy and compatibility

The baseline is 2026/27. Saved country profiles record counterpart, version, reference season and sources. Explicitly identified 2025/26 regulations supply details without a newer published source. Profiles remain frozen in future fictional seasons, with the documented German direct-promotion rotation continuing; they do not predict future federation changes.

Existing compact worlds keep 24 eight-club leagues, 192 clubs, 4,224 initial players, quadruple round robin, two-up/two-down movement and a 34-week calendar. Missing `format` means legacy, never regeneration. File schema v4 supports both formats and gallery collections without replacing existing identities/results/rules.

## National structures

Initial groups play home-and-away round robins. Counts exclude cups, playoffs and second phases. Odd groups include byes.

| Country (older worlds) | Tier sizes, top to bottom                     | Regular matches per club    |
| ---------------------- | --------------------------------------------- | --------------------------- |
| England (Aldoria)      | 20; 24; 24; 24; 24; North/South 24 each       | 38; 46; 46; 46; 46; 46      |
| France (Valmere)       | 18; 18; 18; three groups of 16                | 34; 34; 34; 30              |
| Spain (Solara)         | 20; 22; two groups of 20; five groups of 18   | 38; 42; 38; 34              |
| Germany (Nordhaven)    | 18; 18; 20; four groups of 18 and Bavaria 19  | 34; 34; 38; 34 / Bavaria 36 |
| Italy (Belloria)       | 20; 20; three groups of 20; nine groups of 18 | 38; 38; 38; 34              |
| Portugal (Kestrelia)   | 18; 18; two groups of 10; four groups of 14   | 34; 34; 18; 26              |

### England

Premier League relegates three. Championship promotes two automatically; 3–8 contest playoffs. Fifth hosts eighth and sixth hosts seventh in single eliminators; third/fourth join two-leg semifinals seeded against survivors, before a neutral final. League One promotes two plus a 3–6 playoff winner; League Two promotes three plus a 4–7 winner. Both use two-leg semifinals and a neutral single final. Championship relegates three, League One four, League Two two.

National League promotes its champion plus a 2–7 playoff winner; four go down. North/South each promote a champion plus a 2–7 playoff winner; four per group leave the frontier. Non-league brackets use single eliminators, single semifinals with second/third entering later, and a final. Tier-five final is neutral; regional finals use the higher finisher's ground. Tier six supplies the semi-professional starting environment.

Sources: [Premier League guide](https://www.premierleague.com/en/news/4365156/new-to-the-premier-league-heres-all-you-need-to-know), [2026/27 Championship reform](https://www.efl.com/news/2026/march/05/efl-statement--sky-bet-championship-play-off-format/), [EFL 2026/27 regulations](https://images.gc.eflservices.co.uk/c99e4490-a070-11f1-b53b-9be1de328ad3.pdf), [EFL 2026/27 playoff rules](https://images.gc.eflservices.co.uk/659e3bb0-7b8d-11f1-b366-6527b2d4899f.pdf), [FA 2026/27 allocations](https://www.thefa.com/news/2026/may/14/nls-club-allocations-2026-27). National League playoff details explicitly carry forward the published 2025/26 [tier-five appendix B](https://images.gc.nationalleagueservices.co.uk/f1dfd150-97b4-11f0-b55f-398469255719.pdf) and [regional appendix C](https://images.gc.nationalleagueservices.co.uk/f173c910-97b4-11f0-8211-c57fd24070cf.pdf).

### France

Ligue 1/Ligue 2 each have two automatic relegations; Ligue 2/Ligue 3 each have two automatic promotions. Ligue 2 fifth visits fourth, then the winner visits third; that winner meets Ligue 1 sixteenth over two legs. Professional Ligue 3 replaces National: third hosts sixth and fourth hosts fifth, followed by a single final at the higher finisher; the winner meets Ligue 2 sixteenth over two legs. Ligue 3 relegates three.

National 1 replaces former National 2: three groups of 16. Each group's best eligible club goes up; bottom two per group and the worst two fourteenth-placed clubs go down, eight total. Comparing fourteenth places is direct relegation, not a survival tie. The exceptional 17-club 2025/26 National and administrative exclusions/reprieves are not recreated.

Sources: [FFF Ligue 3 reform](https://www.fff.fr/article/16778-la-fff-officialise-la-ligue-3-professionnelle.html), [FFF 6 June 2026 adopted texts](https://media.fff.fr/uploads/documents/textes-votes-a-l-ag-fff-du-06.06.2026.pdf), [LFP 2025/26 professional details carried forward](https://www.lfp.fr/assets/25_26_Reglement_Competitions_29_07_2024_5055b664e4.pdf).

The professional ranking order follows the [official Ligue 1 tiebreak clarification](https://ligue1.com/en/articles/l1_article_2830-en-cas-d-egalite-au-classement-modifications-des-criteres).

### Spain

Primera relegates three. Segunda promotes two plus a 3–6 winner from two rounds of two-leg ties; four go down. Aggregate draws favor the higher finisher after extra time. Primera Federación promotes both champions plus two playoff winners. Each group's 2–5 enter cross-group two-leg semifinals/finals seeded by rank; five per group go down.

Segunda Federación promotes five champions plus five winners from positions 2–5 across five groups, through two cross-group two-leg rounds. Draws prioritize different groups and stronger-versus-weaker ranks; equal-rank aggregate ties use extra time/penalties. Where a surviving field makes different-group pairing impossible, a seeded rank pairing supplies the actual ties. Bottom five per group go down; the worst four thirteenth-placed clubs contest two two-leg survival ties, adding two departures: 27 total.

Sources: RFEF 2026/27 [Primera/Segunda División](https://rfef.es/sites/default/files/pdf/circulares/1._Circular_84_-_CNL_Primera_y_Segunda_Division___Anexo.pdf), [Primera Federación](https://rfef.es/sites/default/files/pdf/circulares/2._Circular_85_-_CNL_Primera_Federacion___Anexo.pdf), [Segunda Federación](https://rfef.es/sites/default/files/pdf/circulares/3._Circular_86_-_CNL_Segunda_Federacion___Anexo.pdf).

### Germany

Bundesliga and 2. Bundesliga each exchange two automatic places plus a two-leg upper-sixteenth/lower-next-eligible tie, normally third. 3. Liga relegates four. Regionalliga West/Southwest champions go up directly. Northeast has the rotating direct place in 2026/27; North/Bavaria champions play two legs. The saved rotation then moves the direct place through Bavaria and North. The proposed four-region reform is not this profile.

Fourth-tier relegation depends on incoming 3. Liga clubs and feeder admissions, rather than uniform bottom-two movement:

- North normally has three departures and three feeder admissions, reducing departures if needed to avoid undershooting 18. Overflow is corrected through additional departures in the next season.
- Northeast admits two feeders. The 2026/27 source specifies one departure with no incoming third-tier club and two with one incoming club. More than one incoming club in a future fictional season uses a documented capacity-balancing extrapolation.
- West admits four feeders and caps ordinary departures at four, reducing them to avoid undershooting 18. Excess incoming clubs can expand the group.
- Southwest admits four feeders and uses at least three, at most six departures according to incoming clubs and capacity.
- Bavaria has two direct entrants and two feeder challengers for survival ties; additional deciding ties can adjust capacity. It begins with 19 clubs/byes. Later capacities follow the saved calculation rather than forcing every group to 18.

Sources: [Bundesliga boundary rules](https://www.bundesliga.com/en/faq/what-are-the-rules-and-regulations-of-soccer/how-does-promotion-and-relegation-work-in-the-bundesliga-10645), [DFB regional rotation](https://www.dfb.de/news/detail/aufstieg-von-regionalliga-zur-3-liga-fragen-und-antworten-208044), [North playing regulations §6](https://www.nordfv.de/der-nfv/satzung-ordnungen/spielordnung), [Northeast 2026/27 movement](https://www.nofv-online.de/files/Inhalt/Aktuelles/2026_Q2/260626_Herren_Auf-und%20Abstiegsregelung%202026-27_final.pdf), [West 2026/27 movement](https://wdfv.de/download/herren-regionalliga-west/herren-regionalliga-west-auf-und-abstiegsregelung-fuer-die-saison-20262027.pdf), [Southwest August 2026 regulations §47](https://res.cloudinary.com/rlsw/image/upload/v1785911302/Spielordnung_RLSW_Stand_Stand_01.08.26_pxvhrg.pdf), [Bavaria 2026/27 movement](https://www.bfv.de/binaries/content/assets/inhalt/der-bfv/satzung-richtlinien-amtliches/amtliches/spielausschuss/auf--und-abstiegsregelung-regionalliga-bayern-2026_2027.pdf). Feeder selection represents the lower-tier frontier, not a simulated Oberliga pyramid.

### Italy

Serie A relegates three. Decisive equal-point championship/relegation boundaries use deciding ties: a single championship match at the higher finisher and a two-leg 17th/18th survival decision with the lower finisher home first. Unresolved ties go directly to penalties. These details explicitly carry forward 2025/26.

Serie B promotes two; third is also automatic only with a lead over fourth exceeding 14 points. Otherwise 3–8 enter playoffs: fifth/eighth and sixth/seventh play single preliminaries, third/fourth join two-leg semifinals, then a two-leg final. Rank advantage resolves eligible aggregate ties; equal-point finalists use extra time/penalties. Bottom three go down; sixteenth/seventeenth play two legs unless the gap exceeds four points, when seventeenth goes down directly.

Serie C has three groups of 20. Champions and one national playoff winner go up. Group rounds feed six survivors; three third-placed clubs and the tier-cup qualifier join a seeded national round. The three runners-up enter the next national round, followed by two-leg semifinals/final. Cup qualification passes to an eligible finalist or league fallback when required. Bottom club per group goes down; 16th/19th and 17th/18th survival ties add two per group, omitted when the gap exceeds eight points.

Serie D promotes nine champions. Equal points at the championship boundary require a neutral deciding match with extra time/penalties. Positions 2–5 play single ranking playoffs without additional automatic promotion. Bottom two per group go down; 13th/16th and 14th/15th play single survival matches at the higher finisher, omitted when the gap is at least eight points. Extra time precedes rank advantage in survival draws. Equal points at the 16th/17th direct-relegation boundary first require a neutral preliminary deciding match with extra time/penalties. Ordinary movement totals nine up and 36 out at the frontier.

Sources: [Serie A 2025/26 deciding ties carried forward](https://www.figc.it/media/274515/331-deroga-art-51-noif-determinazione-classifica-campionato-serie-a-ss-2025-2026.pdf), [Serie B 2025/26 thresholds carried forward](https://d5rzfs5ck83rq.cloudfront.net/legab.it/img/news/2025-26/39-deroga-art-51-noif-classifica-finale-play-off-e-play-out-campionato-serie-b-ss-2025-2026.pdf), [Serie C official documents](https://www.seriec.com/documentazione), [FIGC NOIF classification/reserve regulations, May 2026](https://files.figc.it/view/acePublic/alias/contentid/1qzg5l96u12qfpnd689/0/tit3_noif_art_da47a70_------------aggiornato-al_CU209A_del_06-05-2026.pdf), [LND 2026/27 groups](https://lnd.it/seried/attivita-interregionale/i-gironi-del-campionato-2026-2027/), [LND 2026/27 survival rules](https://lnd.it/seried/il-regolamento-playout-per-la-stagione-2026-2027/).

### Portugal

Primeira/Liga Portugal 2 each have two automatic relegations. Liga Portugal 2 promotes its top two eligible clubs; the next eligible club faces Primeira sixteenth over two legs. Liga Portugal 2 sixteenth faces third in the Liga 3 promotion phase.

Liga 3 starts with two groups of ten. Top four per group enter an eight-club home/away promotion league with points reset: top two eligible clubs go up and third enters the barrage. Remaining clubs enter two six-club home/away survival groups; bottom two per group go down. Survival bonus: fifth through tenth supplies six through one points. First-phase totals below ten receive zero; 10–14 receive rank bonus, 15–19 add one, 20–24 add two, 25–29 add three, 30+ add four. Exactly ten is ambiguous in explanatory footnotes: this profile explicitly chooses rank bonus under the general table.

Campeonato has four groups of 14. Top two per group enter two four-club home/away promotion leagues with points reset. Top two per promotion league go up; winners play a neutral single championship final. Initial 13th/14th go down; 11th/12th cross-pair with the adjacent group in two-leg survival ties, adding four departures: 12 total.

Titles (Phase 1.4): first-phase group winners in Liga 3 and the Campeonato only qualify; history labels them as first-phase winners. The Liga 3 champion is the promotion-league winner (no final is modelled), and the Campeonato champion is the final's winner. Seasons archived before Phase 1.4 keep their stored group winners unchanged.

Sources: [Liga Portugal 2026/27 regulations](https://www.ligaportugal.pt/backoffice/assets/20260701_RC_2026_27_f53785bcd4.pdf), [FPF Liga 3 2026/27 format](https://www.fpf.pt/DownloadDocument.ashx?id=32598), [FPF Campeonato 2026/27 format](https://www.fpf.pt/DownloadDocument.ashx?id=32599).

## Identities

Identity version 2 (`World.identityVersion`) separates **places** from **football names**:

- **Real:** the six countries, their regions, and every town, with real coordinates. Data lives in `src/engine/world/identities/<country>.ts`.
- **Fictional, but referenced:** clubs, leagues and cups. Each carries a `reference` to its real counterpart, and division names use descriptive parodies. The Rules panel shows "Real-world model: …".

Professional tiers are mapped **one to one** to the real 2026/27 memberships, after the 2025/26 promotions, relegations and playoffs. That covers 302 clubs:

| Country  | Referenced tiers                                     | Clubs |
| -------- | ---------------------------------------------------- | ----- |
| England  | Premier League, Championship, League One, League Two | 92    |
| France   | Ligue 1, Ligue 2                                     | 36    |
| Spain    | LaLiga, LaLiga Hypermotion                           | 42    |
| Germany  | Bundesliga, 2. Bundesliga, 3. Liga                   | 56    |
| Italy    | Serie A, Serie B                                     | 40    |
| Portugal | Liga Portugal, Liga Portugal 2                       | 36    |

Each referenced club is named **city + nickname**, for example North London Cannons, Munich Reds, Lisbon Eagles or Bergamo Goddess. Each also keeps:

- its real home city, coordinates and region;
- its real club colours and home-shirt pattern, on original SVG crests and kits;
- its stadium name and capacity;
- a 1–10 stature that places its reputation within the tier's band.

Real reserve teams in referenced tiers are linked to their parents. Examples: Vigo Celestes B and San Sebastián Txuri-Urdin B (Segunda); Sinsheim Kraichgauers II and Stuttgart Swabians II (3. Liga); Lisbon Eagles B, Porto Dragons B and Lisbon Lions B (Liga Portugal 2). They wear the parent's kits and keep their real home grounds: Seixal, Vila Nova de Gaia and Alcochete for the Portuguese B teams.

Lower tiers (National League and below, Ligue 3/National 1, Primera/Segunda Federación, Regionalliga, Serie C/D, Liga 3/Campeonato) are filled with **generated clubs in real towns**:

- Towns are drawn without repeats from region pools, at least 1.4× the clubs needed.
- Towns are never a referenced club's home city.
- Names use the country's usual form: Bedford Albion, AS Tourcoing, CD Fraga, TSV Itzehoe 1904, Calcio Treviso, GD Lagos. The form is keyed on the town, so it does not rotate visibly across a table.
- Feeder clubs admitted below the frontier take unused real towns from the same region.

| Country  | Divisions, top to bottom                                                                                         | Domestic cup                          |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| England  | English Premier Division; Championship; Division One; Division Two; English National Division (then North/South) | English Association Cup               |
| France   | French Première, Deuxième and Troisième Division; French National Division (North-West, North-East, South)       | French National Cup                   |
| Spain    | Spanish Primera; Segunda; Primera Federal (North/South); Segunda Federal (five groups)                           | Spanish Royal Cup                     |
| Germany  | German Erste, Zweite and Dritte Liga; German Regionalklasse (Nord, Nordost, West, Südwest, Bayern)               | German Federation Cup                 |
| Italy    | Italian Prima, Seconda, Terza (Girone A–C) and Quarta Serie (Girone A–I)                                         | Italian National Cup; Terza Serie Cup |
| Portugal | Portuguese Primeira; Segunda; Terceira (North/South); Portuguese National Championship (Series A–D)              | Portuguese National Cup               |

Continental names are reserved for milestone 8: European Champions Cup, European Shield and European Conference Trophy.

**Identity adaptations:**

- The rule fingerprint excludes display names. Region keys are unchanged, so identity version 2 changes no sporting rule, and older saves with fictional names validate as before.
- Italy's identity assigns Serie C groups by geography: Girone A covers Northwest/West/Northeast, B North-central/Central-west/Central-east, and C Southwest/Southeast/Islands. Region keys still come from the Serie D groups.
- Where a group region is broader than a club region (Portugal's Liga 3 North/South against four Campeonato regions), forced reserve demotions go to the group with the most clubs from the reserve's region.
- Club regions are game regions, not administrative ones. Both Paris clubs sit in Northwest and Monaco in South. London clubs use the city "London" and are distinguished by name.
- Club memberships were researched from the leagues' published 2026/27 memberships. Per-club source URLs are not recorded. `npx tsx scripts/check-identity.ts <country>` checks the data's counts, regions, colours, duplicates, town coverage and reserve links.

## Deliberate adaptations

- Identity: see [Identities](#identities). Kits and crests are original SVG. Names are parodies that reference real clubs; they are not licensed identities. Worlds generated before identity version 2 keep fictional town, club, stadium and coordinate pools.
- The calendar uses 60 abstract simulation weeks, not 60 literal weeks between annual dates. Real match counts fit regular schedules, second phases and playoffs; development, finances and events still tick in game weeks.
- Cups are six all-club single-leg national knockouts plus Italy's tier-three cup, which supplies a playoff qualification place. Fields use byes. They deliberately differ from actual FA Cup/Copa/Coupe/Taça admission/qualifying formats. Continental cups remain milestone 8.
- Generated feeder clubs replace departures below the simulated frontier. Departed identities/people persist; full feeder leagues, feeder fixtures and administrative licensing are not simulated.
- Reserve-parent references restrict promotion and force demotion when a parent would share the reserve's level. France excludes reserves from professional tier three, Germany from promotion to tier two and Portugal from tier one. Eligibility and planned movements are resolved together.
- No away-goals rule. Serializable ties store legs, aggregates, draw rule and winner; two-leg ties wait for both results. Country ranking follows distinct criteria: English tables use goal difference/goals scored; German professional tables then use head-to-head goal difference/away goals and total away goals; Bavaria prioritizes head-to-head. French professional tables use overall goal difference, head-to-head points/difference, goals scored, wins and away wins. Spanish two-club ties prioritize head-to-head goal difference, while multi-club ties use a head-to-head mini-table. Portugal uses head-to-head points/difference, overall goal difference, wins and goals scored. Final unresolved ties use a seeded lot; fair-play values are treated equally because disciplinary statistics are not simulated.
- League awards count a league's regular-season fixtures only. Second phases and play-off ties are separate competitions in the season statistics, so they count towards all-competition totals (Golden Ball, young player) but not a league's Golden Boot, MVP or team of the season.
- Completed tables, cup winners, actual movements and postseason summaries are archived. Current detailed fixtures/results are replaced on rollover; identities and historical references remain.

## Evidence boundary

Read these source-based profiles alongside [verification](VERIFICATION.md). This document does not substitute for current test/performance evidence or claim exact replication of every licensing, disciplinary or administrative rule. Older references and the named identity, calendar, cup and feeder choices are explicit parts of this versioned game format.
