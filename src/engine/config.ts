/** Identifies the build that last wrote a save. Informational; compatibility uses schema and rule versions. */
export const ENGINE_VERSION = 'ptg-hardening-1';
export const CONFIG = {
  match: {
    /** Opportunity count: clamp(momentBase + involvement + round((form − 50) / formStep) ± 1). */
    minimumMoments: 6,
    maximumMoments: 15,
    momentBase: 8,
    involvement: { attack: 1, other: 0, keeper: -1 },
    formStep: 10,
    fatiguePerMinute: 0.6,
    /** Keepers' outfield stamina is untrained; their in-match fatigue uses at least this. */
    keeperStamina: 70,
    highRiskFatigue: 0.08,
    halftimeRecovery: 8,
    substitutionFatigue: 75,
    minimumSubstitutionMinute: 65,
    /** No new substitution is triggered from this minute onwards. */
    substitutionCutoffMinute: 90,
    /**
     * Playable extra time (engine match-18): its length, and the player's key moments in it
     * (between the bounds, from this many minutes in; none once off the pitch). Substitutions
     * stop at the cutoff above, so none are made in extra time.
     */
    extraTime: { minutes: 30, moments: [1, 2] as const, firstMoment: 4 },
    /**
     * Opponent identity (match-19, review phase 4, step 4.1). Each opposing style multiplies the
     * weight of the situations it brings about (moment budgets are normalised by the same
     * weights, so goals per match are unchanged) and the odds of the choices it bears on.
     */
    styles: {
      press: {
        situations: { 'build-out': 1.6, 'build-up': 0.85 },
        choices: {
          'short-pass': 0.92,
          'carry-out': 0.92,
          'press-escape': 1.08,
          'clear-long': 1.04,
        },
      },
      counter: {
        situations: { 'edge-of-area': 1.4, 'aerial-chance': 1.3, 'box-chance': 0.8 },
        choices: { 'take-on': 0.92, 'square-pass': 0.95, 'long-shot': 1.06, curler: 1.06 },
      },
      possession: {
        situations: { 'defend-attack': 1.3, 'build-up': 0.9 },
        choices: { intercept: 0.94, jockey: 1.05, 'track-runner': 1.04 },
      },
      direct: {
        situations: { 'aerial-chance': 1.25, 'cross-ball': 1.3, 'defend-attack': 1.1 },
        choices: { header: 1.04, 'slide-block': 1.04, 'carry-forward': 1.05 },
      },
      balanced: { situations: {}, choices: {} },
    } as Record<string, { situations: Record<string, number>; choices: Record<string, number> }>,
    /**
     * The preferred foot (match-19, step 4.2): a shot, cross or carry on the weaker foot
     * multiplies its odds by `weak` unless the player is two-footed; cutting inside onto the
     * stronger foot from the opposite flank by `inside`. Moments within `centre` of the middle
     * have no foot to favour.
     */
    foot: { weak: 0.88, inside: 1.06, centre: 12 },
    /**
     * Decisive defending (match-20, review phase 6): a position's defence share × `share`
     * (to `maximum`), and defending choices' attribute slope × `attributeSlope`. Neutral for a
     * reference player, so goals per match hold; choosing well prevents more.
     */
    defending: {
      share: { GK: 1.3, CB: 1.5, LB: 1.5, RB: 1.5, DM: 1.5 } as Partial<Record<string, number>>,
      maximum: 0.6,
      attributeSlope: 1.5,
      /**
       * Screening (match-21), replacing the values above where given: a defensive
       * midfielder's defence share × 2.1, and a keeper's saves an attribute slope × 2.25.
       */
      screening: {
        share: { DM: 2.1 } as Partial<Record<string, number>>,
        attributeSlope: { GK: 2.25 } as Partial<Record<string, number>>,
      },
    },
    /**
     * A week with an opponent session in the training plan (match-19): the share of the
     * opposition style's penalties the player still feels in the next match.
     */
    prepared: 0.5,
    /** A manager may also replace a poor or well-protected player at these minutes. */
    tacticalSubstitution: { minutes: [60, 70, 80], chance: 0.08, ratingBelow: 6, leadingBy: 2 },
    /** Players named on a matchday bench (engine match-15). */
    benchSize: 7,
    /**
     * The managers' own substitutions (engine match-15): how many each makes (count, weight),
     * between minutes `from` and `to`, at most `limit` a side. Who comes off is weighted
     * 1 + fatigue × fatigue + (staminaFrom − stamina)⁺ × stamina + (formFrom − form)⁺ × form.
     */
    aiSubstitutions: {
      limit: 5,
      from: 60,
      to: 80,
      counts: [
        [1, 0.1],
        [2, 0.25],
        [3, 0.4],
        [4, 0.2],
        [5, 0.05],
      ] as const,
      fatigue: 0.05,
      staminaFrom: 70,
      stamina: 0.06,
      formFrom: 55,
      form: 0.05,
    },
    /** Who a card is shown to: weighted base + aggression × a + tackling × t. */
    discipline: { base: 20, aggression: 1, tackling: 0.5 },
    /**
     * Full discipline (engine match-16; docs/MATCH-BALANCING.md "Full discipline"). Each side
     * is shown a card in a minute with `perTeamPerMinute`; the player is drawn among its
     * outfielders on the pitch, weighted as the cosmetic cards (base + aggression × a +
     * tackling × t), a booked player × `bookedCaution`. The card is a straight red with
     * `straightRed` × (1 + (aggression − 50) × `straightAggression`), else a yellow (a second
     * yellow sends off). A side loses at most `maxDismissals`.
     */
    cards: {
      perTeamPerMinute: 0.0205,
      bookedCaution: 0.16,
      straightRed: 0.0155,
      straightAggression: 0.02,
      maxDismissals: 3,
      /**
       * While the selected player is on, their own defending moments carry their booking risk,
       * so their weight here is × (1 − defence share × `selectedDefence`), at least 0.
       */
      selectedDefence: 2,
      /**
       * Each man down: the side's expected goals × (1 − `attack`), at least `attackFloor`;
       * the opposition's × (1 + `concede`); possession − `possession` points; team odds as if
       * `strength` strength points weaker.
       */
      menDown: { attack: 0.3, attackFloor: 0.4, concede: 0.45, possession: 5, strength: 8 },
      /** The selected player's rating for each yellow, and for a dismissal. */
      rating: { yellow: -0.2, red: -1 },
      /** Fame lost to a dismissal, and the manager's trust for each kind. */
      fame: 2,
      trust: { 'second-yellow': -2, 'straight-red': -4 },
    },
    /**
     * A defending choice's booking risk (match-16): a failed attempt is a foul worth a card with
     * `foul` × aggression (1 + (aggression − 50) × `aggression`) × tackling (1 − (tackling − 50)
     * × `tackling`) × `booked` once on a yellow; of those, `straight` are straight reds.
     */
    booking: {
      choices: {
        tackle: { foul: 0.11, straight: 0.05 },
        'slide-block': { foul: 0.14, straight: 0.08 },
        'stretch-tackle': { foul: 0.2, straight: 0.2 },
        'body-block': { foul: 0.06, straight: 0.03 },
        intercept: { foul: 0.04, straight: 0.03 },
        'track-runner': { foul: 0.07, straight: 0.04 },
        jockey: { foul: 0.02, straight: 0.02 },
        'drop-off': { foul: 0.02, straight: 0.02 },
        // Engine match-22 (step 5.2): the new defending choices. A professional foul is a foul
        // whenever it succeeds (`foulOnSuccess`); its straight-red share follows the cover read
        // (`moments22.professionalFoul`).
        'professional-foul': { foul: 1, straight: 0.1 },
        'chase-back': { foul: 0.08, straight: 0.06 },
        'engage-carrier': { foul: 0.1, straight: 0.04 },
        'block-cross': { foul: 0.06, straight: 0.03 },
        'man-mark': { foul: 0.05, straight: 0.02 },
        'press-carry': { foul: 0.12, straight: 0.05 },
        // Decision chains (X1a): pressing the carrier fails into a foul, a card with this chance.
        'position-press': { foul: 0.12, straight: 0.03 },
      } as Record<string, { foul: number; straight: number }>,
      aggression: 0.012,
      tackling: 0.008,
      booked: 0.8,
      minimum: 0.01,
      maximum: 0.6,
    },
    /** Background shot → goal conversion, and created-chance goal probability per recorded shot. */
    shotConversion: 0.12,
    chanceConversion: 0.3,
    /**
     * Shots (engine match-22, release 1.0 step 5.3). The background converts `conversion` of its
     * shots, so it shoots more for the same goals. The player's own missed shot keeps the ending
     * its commentary line names, but hits the woodwork with `woodwork` (others' misses: see
     * `missedShot`).
     */
    shots22: { conversion: 0.088, woodwork: 0.04 },
    passPerMinute: 0.48,
    routinePass: { base: 0.68, passing: 0.002, fatigue: 0.0008, minimum: 0.4, maximum: 0.96 },
    /**
     * Personal tactics adjust strength-model expectations. Mentality and some roles scale
     * [own, opposition] expected goals: attacking opens the game both ways, defensive closes
     * it; risk scales the total.
     */
    tactics: {
      mentality: { attacking: [1.08, 1.06], defensive: [0.92, 0.9] } as const,
      riskTotal: { low: 0.95, balanced: 1, high: 1.06 },
    },
    /** Fraction of own [attack] and opposition [defence] expected goals replaced by key moments. */
    shares: {
      ST: [0.37, 0.04],
      LW: [0.32, 0.05],
      RW: [0.32, 0.05],
      AM: [0.32, 0.05],
      CM: [0.26, 0.12],
      DM: [0.1, 0.26],
      CB: [0.07, 0.32],
      LB: [0.1, 0.28],
      RB: [0.1, 0.28],
      GK: [0.03, 0.45],
    },
    decision: {
      /** Success odds × (1 + (attribute − matchLevel) × slope), bounded. */
      attributeSlope: 0.02,
      attributeMinimum: 0.5,
      attributeMaximum: 1.6,
      /** Goal impact (created-chance conversion, failure danger) scales the same way. */
      impactSlope: 0.01,
      impactMinimum: 0.7,
      impactMaximum: 1.3,
      traitMultiplier: 1.2,
      /** Each further skill covering a choice multiplies its odds again, to a limit. */
      traitStack: 1.1,
      traitStackMaximum: 1.45,
      /** A choice already this likely takes its trait bonus on impact instead of odds. */
      traitImpactThreshold: 0.75,
      traitImpact: 1.1,
      /** Impact skills stack by traitStack too (match-17), to this limit. */
      traitImpactMaximum: 1.3,
      /** In a fixture of importance above 1: base + temperament × slope, plus the Big Game
       * Player skill. */
      bigGame: { base: 0.9, slope: 0.002, skill: 0.1 },
      /** Per match, governing attributes shift by up to ± spread × (1 − consistency / 100). */
      consistencySpread: 8,
      /** Attribute points lost per point of familiarity below 100 in the slot played. */
      positionPenalty: 0.1,
      /** Odds × (1 + (own momentum − 50) × slope): a team on top finds everything easier. */
      momentumSlope: 0.002,
      /** Half-time: the talk's effect on second-half odds and on momentum. */
      talk: {
        motivate: 1.03,
        complain: 0.97,
        momentum: 8,
        leaderBonus: 1.5,
        /**
         * Demanding the ball (match-13): the attacking share × `share` for the second half,
         * at most `maximum`, and `trust` with the manager.
         */
        demand: { share: 1.25, maximum: 0.6, trust: -3 },
      },
      /** The captain's call with the Captain's Voice skill also moves momentum. */
      captainsVoice: { push: 6, calm: 3 },
      /** Second Wind slows in-match fatigue. */
      secondWindFatigue: 0.85,
      /** A chance made for a teammate converts by their finishing against the player's own. */
      receiver: { slope: 0.005, minimum: 0.9, maximum: 1.1 },
      roleMultiplier: 1.12,
      roleCounterRelief: 0.85,
      /** Non-direct base odds × (1 + (own − opposition strength) × slope), bounded. */
      teamSlope: 0.012,
      teamMinimum: 0.75,
      teamMaximum: 1.3,
      /** Odds × (1 − (direct opponent ability − matchLevel) × slope), bounded. */
      matchupSlope: 0.006,
      matchupMinimum: 0.85,
      matchupMaximum: 1.15,
      fatigueThreshold: 25,
      fatigueSlope: 0.006,
      fatigueMinimum: 0.6,
      risk: {
        low: { odds: 1.1, impact: 0.92 },
        balanced: { odds: 1, impact: 1 },
        high: { odds: 0.9, impact: 1.1 },
      },
      /** Risk on direct shots: careful shots go in more often, ambitious ones less. */
      riskShot: { low: 1.03, balanced: 1, high: 0.95 },
      /** Defensive choices concede this fraction of the replaced opposition expectation. */
      defensiveEdge: 0.9,
      minimumProbability: 0.02,
      maximumProbability: 0.97,
      maximumShotProbability: 0.6,
      maximumConversion: 0.95,
    },
    /** Odds multipliers 1 + effect for technical/direct choices; pitch below `pitchGood`. */
    conditions: {
      pitchGood: 70,
      pitchSlope: 0.004,
      /**
       * Engine match-15 (redesign M8): the weather has an intensity, drawn after it with these
       * weights (the mean scale is 1), which scales its own effect; the pitch is a separate
       * factor. `split` is the weather's part (the wet surface moved to `pitchState`: technical
       * odds lost on a pitch the rain or snow made heavy or frozen).
       */
      intensity: { light: 0.5, steady: 1, heavy: 1.5 },
      intensityWeights: { light: 0.3, steady: 0.4, heavy: 0.3 },
      split: {
        technical: { clear: 0, rain: -0.03, wind: 0, snow: -0.05 },
        direct: { clear: 0, rain: -0.02, wind: -0.08, snow: -0.05 },
      },
      pitchState: { firm: 0, good: 0, heavy: 0.05, frozen: 0.05 },
    },
    rating: {
      base: 6.3,
      decisionWeight: 0.6,
      /** Equal goal and assist credit keeps finishing and creating choices rating-neutral. */
      goal: 0.6,
      assist: 0.6,
      /** Saves and defensive stops: stop × expected goals removed ÷ success probability. */
      stop: 2,
      /** Every goal conceded from the player's own key moment. */
      error: -0.45,
      /** The team's result (± for a win or loss) and a clean sheet for keepers and defenders. */
      result: 0.25,
      cleanSheet: 0.4,
      minimum: 3,
      maximum: 10,
    },
    /**
     * The rating from engine match-22 (release 1.0 step 5.3; docs/MATCH-BALANCING.md "Rating
     * (match-22)"). Every key moment is measured against what the reference player was expected
     * to make of it, so a rating centres on `base` in every position whatever the mix of
     * moments:
     *
     * - decision: `decision[family] × (success − reference odds)`, to the choice's family
     *   (defending and keeping weigh more: their value is mostly in the decision itself);
     * - as they happen: goals and assists (each further one in a match × `repeat` of the one
     *   before; a hat-trick's third goal adds `hatTrick`), saves and stops (`stop × danger ÷
     *   reference odds`, the odds at least `stopFloor`, the credit at most `stopCap`) and
     *   errors (`error` a goal conceded from the moment);
     * - par: at each moment, minus what the reference player would earn there on average:
     *   goal × expected own goals + assist × expected assists (both × `repeat` as above) +
     *   reference odds × a stop's credit + error × expected goals conceded. The hat-trick bonus
     *   is left out (rare, and a striker on two goals is not marked down for every chance).
     *
     * Each of these is × √(`moments` ÷ the match's planned moments), at least `fewest`, so a
     * busy match is not a wider one. The team's result is ± `result`; a clean sheet adds
     * `cleanSheet` for keepers, defenders and (match-22) defensive midfielders. The sum's
     * distance below `base` counts × `lean[0]` and above it × `lean[1]`, so a poor match is
     * rarely a disaster and a great one stands out; beyond the `knees` the rating moves at
     * `beyond` of the rate (a soft limit at each end), then is bounded to minimum–maximum.
     */
    rating22: {
      base: 6.63,
      moments: 10,
      fewest: 6,
      /** Decision chains (X1a): the planned steps a credit is measured against. */
      chainSteps: 12,
      decision: {
        shooting: 0.2,
        passing: 0.35,
        dribbling: 0.36,
        defending: 0.35,
        goalkeeping: 0.3,
      },
      goal: 0.9,
      assist: 0.85,
      repeat: 0.55,
      hatTrick: 1.2,
      stop: 0.9,
      stopFloor: 0.3,
      stopCap: 0.85,
      error: -0.4,
      result: 0.2,
      cleanSheet: 0.25,
      lean: [0.8, 1.15] as const,
      knees: [5.6, 9.2] as const,
      beyond: [0.5, 0.6] as const,
      /** A manager's tactical substitution looks at a rating below this (match-21: 6). */
      substituteBelow: 6.3,
      minimum: 3,
      maximum: 10,
    },
    momentum: { decay: 0.85, shot: 4, goal: 12, success: 3, failure: 2, minimum: 5, maximum: 95 },
    possession: { strengthSlope: 0.45, mentality: 3, momentum: 0.08, minimum: 30, maximum: 70 },
    /**
     * Possession from engine match-22 (step 5.3): the match-21 terms, plus the home side's
     * `home` points (not at a neutral venue), each side's playing style (`styles`, the home
     * side's less the away side's), the game plan of the day (± `spread`, a triangular draw on
     * its own stream) and the score: a side ahead sits deeper, `lead` points a goal, at most
     * `leadCap` goals.
     */
    possession22: {
      home: 2.5,
      styles: { possession: 6, press: 2, balanced: 0, direct: -3, counter: -5 } as Record<
        string,
        number
      >,
      spread: 18,
      lead: 2,
      leadCap: 3,
      minimum: 25,
      maximum: 75,
    },
    commentaryVariants: 3,
    /**
     * How a shot outside the player's own choices that does not go in is missed (match-22,
     * release 1.0 step 5.5): the commentary names it and the pitch draws it. Relative weights.
     * Step 5.3 moved them to real bands, about a quarter of misses on target (held, parried)
     * and so 30–40% of all shots, and added the woodwork (`stats.woodwork`).
     */
    missedShot: {
      held: 0.17,
      parried: 0.09,
      wide: 0.24,
      over: 0.16,
      blocked: 0.3,
      woodwork: 0.04,
    },
    /**
     * Moments that follow the game (engine match-12). The last moment is placed at
     * `lateDecisionMinute`: within `closeMargin` it comes in the closing minutes, otherwise
     * at `routineLateMinute`. From `tiltFromMinute` a side chasing the game sees attacking
     * situations × tilt, a side protecting a lead defending ones.
     */
    drama: {
      lateDecisionMinute: 80,
      closeMargin: 1,
      lateMinutes: [86, 89] as const,
      routineLateMinute: 82,
      tiltFromMinute: 60,
      tilt: 1.6,
      situationVariants: 3,
      /** Set pieces raise a taker's attacking share by their weight, up to this factor. */
      setPieceShareCap: 1.3,
    },
    /**
     * Choices that decide matches (engine match-22, release 1.0 step 5.2; docs/MATCH-BALANCING.md
     * "Reads, situations and mechanics"). The read tables and the new situations are catalogue
     * data in `match/situations22.ts`; the scalars are here.
     */
    moments22: {
      /** Framing sentences per situation (the shootout keeps its three). */
      situationVariants: 5,
      /**
       * Fraction of own [attack] and opposition [defence] expected goals replaced by the
       * player's key moments, replacing `shares` × `defending` (match-20, match-21): more of a
       * match passes through the player's decisions, the striker's share unchanged.
       */
      shares: {
        ST: [0.37, 0.05],
        LW: [0.5, 0.08],
        RW: [0.5, 0.08],
        AM: [0.36, 0.07],
        CM: [0.32, 0.16],
        DM: [0.12, 0.48],
        CB: [0.08, 0.6],
        LB: [0.12, 0.55],
        RB: [0.12, 0.55],
        GK: [0.06, 0.82],
      } as Record<string, readonly [number, number]>,
      /** Auto-play draws only between choices this close to the best (`autoPlayMargin` before). */
      autoPlayMargin: 0.004,
      /**
       * A matchup read (pace: pace + acceleration; aerial: heading + jumping + strength, each
       * averaged) is "ahead" when the player's mean beats the direct opponent's by more than
       * `margin` points, "behind" below −margin, else level (no factor).
       */
      matchupMargin: 5,
      /**
       * Clutch (review C13): its odds apply only to a clutch moment — from `fromMinute` with the
       * game within `closeMargin` goals, or in a fixture of importance `importance` or more —
       * and then to every choice, × `odds` (a named factor), instead of four shots at any time.
       */
      clutch: { fromMinute: 75, closeMargin: 1, importance: 1.25, odds: 1.15 },
      /**
       * The marked man (review C17): when the player's ability exceeds both the match level and
       * the opposition's mean by more than `threshold`, opponents double-mark them. Shots and
       * dribbles × (1 − e), passes to a teammate × (1 + e × `passShare`), and clean chances in
       * the box come up × (1 − e × `boxChance`), where e = min(`maximum`, excess × `slope`).
       * From `relaxFromMinute`, an opposition chasing the game marks × `relax` as tightly.
       */
      marked: {
        threshold: 8,
        slope: 0.025,
        maximum: 0.3,
        passShare: 0.5,
        boxChance: 1,
        relaxFromMinute: 60,
        relax: 0.5,
      },
      /** The straight-red share of a professional foul by the cover read (last man: a red). */
      professionalFoul: { covered: 0.04, alone: 0.12 },
    },
    /**
     * Decision chains (engine match-22, release 1.0 X1a; docs/MATCH-BALANCING.md "Decision
     * chains"). A match's key moments are 4–6 chains of two or three linked decisions in one
     * phase of play: a read, an action and a finish. The catalogue (lead-in steps, what each
     * option stages for the next step, the finishes' options) is data in `match/chainTable.ts`;
     * the scalars are here.
     */
    chains: {
      /**
       * Chains a match by the position played: [fewest, most], drawn with `extreme` at either
       * end and the middle otherwise (an even range: either value at even odds). A big match
       * (importance of at least `bigMatch`) adds one, demanding the ball at half-time one.
       */
      counts: {
        ST: [4, 6],
        LW: [5, 5],
        RW: [5, 5],
        AM: [5, 5],
        CM: [5, 5],
        DM: [4, 5],
        LB: [4, 5],
        RB: [4, 5],
        CB: [4, 4],
        GK: [4, 4],
      } as Record<string, readonly [number, number]>,
      extreme: 0.2,
      bigMatch: 1.25,
      /** Off the bench: chains in the time left. */
      bench: [2, 3] as const,
      /** Demanding the ball at half-time: chains added to the second half. */
      demand: 1,
      /** Touchline interrupts (a knock, a substitution, the captain's call) a match. */
      interrupts: 1,
      /** A chain has three steps with this chance (set pieces and a keeper's build have two). */
      threeSteps: 0.35,
      /**
       * Fraction of own [attack] and opposition [defence] expected goals that passes through
       * the player's chains (replacing `moments22.shares`): fewer, bigger moments carry more of
       * a match.
       */
      shares: {
        ST: [0.37, 0.05],
        LW: [0.5, 0.08],
        RW: [0.5, 0.08],
        AM: [0.36, 0.07],
        CM: [0.32, 0.16],
        DM: [0.12, 0.55],
        CB: [0.08, 0.72],
        LB: [0.12, 0.63],
        RB: [0.12, 0.63],
        GK: [0.06, 0.9],
      } as Record<string, readonly [number, number]>,
      /**
       * The reference player's chance of getting through a lead-in step, by the chain's family:
       * an attacking finish is worth the chain's budget ÷ this for each lead-in step before it,
       * so the chain realises its budget at the reference. Defending and keeping finishes face
       * the same danger whoever gets there (1); a set piece's read never ends its chain (1).
       */
      reach: { attack: 0.75, build: 0.75, defence: 1, keeper: 1, 'set-piece': 1 } as Record<
        string,
        number
      >,
      /**
       * What a failed lead-in step leads to, in expected goals: a break the other way
       * (`counter`), a set piece won (`foulWon`), the ball lost deep (`lostDeep`); being beaten
       * (`beaten`) concedes the finish's danger × this, a foul given away (`foul`, with its
       * card risk) the danger × this, at least a counter's.
       */
      consequences: { counter: 0.15, foulWon: 0.035, foul: 1.3, lostDeep: 0.05, beaten: 1.3 },
      /** The most a chain's budget carries either way (expected goals). */
      maximumBudget: 0.85,
      /**
       * A defending or keeping chain's danger × this: getting goal-side and setting your feet
       * take some of it away, so a chain played well concedes about what a key moment did.
       */
      danger: 1.3,
      /**
       * A lead-in that fails into a foul won (a set piece) is credited as this much of a success
       * in the rating's decision credit: the move stopped, but something came of it.
       */
      foulWonCredit: 0.5,
      /** Bands of an option's chance (`OutcomeBand`): likely at `likely` or more, even from `even`. */
      bands: { likely: 0.65, even: 0.4 },
      /**
       * The honest director. Hero beat: a chain between `hero.from` and `hero.to` is the hero's;
       * when it opens and no chain before it was worth `hero.prize` (expected goals for an
       * attacker, danger for a defender or keeper), its finish is drawn among the situations
       * worth that much, at least `hero.prize`, and it has three steps. Close-game climax: at
       * `climax.decide`, within `climax.margin` goals, the last chain moves to a minute in
       * `climax.minutes` (or, with `climax.addedChance`, one of the first `climax.addedMinutes`
       * of added time) and has three steps. Drought: the first and the hero chains start in the
       * hero's situations. Debut: the first chain comes by `debutBy`.
       */
      hero: { from: 46, to: 60, prize: 0.25 },
      climax: {
        decide: 75,
        margin: 1,
        minutes: [82, 89] as const,
        addedChance: 0.3,
        addedMinutes: 3,
      },
      debutBy: 15,
      /** A match's career drought: this many matches without a positive chain. */
      droughtMatches: 3,
      /** Rating involvement: √(`rating22.chainSteps` ÷ planned steps), planned steps = chains × this. */
      meanSteps: 2.45,
      /** Framing sentences per lead-in step. */
      leadInVariants: 3,
    },
    /** Simulated career matches pick among choices within this many expected goals of the best. */
    autoPlayMargin: 0.02,
    /**
     * The value hint beside each key-moment choice (release 1.0, step 5.1; presentation only):
     * choices within `tie` expected goals of the best are "best value", those `costly` or more
     * below it are "costly", the rest "even". A moment whose choices all lie within `tie` of
     * each other shows every choice as even.
     */
    valueHint: { tie: 0.002, costly: 0.01 },
    /**
     * The occasions (release 1.0 step 5.4, engine match-22 only; docs/MATCH-BALANCING.md "The
     * occasions"). Every value here is read under `rules22` alone, so match-21 sessions replay.
     */
    occasions: {
      /**
       * Stoppage time. At the end of each period the board shows N = base + goals × `goal` +
       * substitutions × `substitution` + cards × `card` + injuries × `injury` + a uniform
       * draw below `jitter` (`${seed}:added:${minute}`), rounded and kept within the period's
       * band; the second half's band stretches to `long.upTo` with `long.chance`. The minute's
       * background goal rate is expected goals ÷ `matchMinutes` (90 plus the mean added time),
       * so goals per match hold while added minutes are played.
       */
      stoppage: {
        periods: {
          45: { base: 0.7, band: [1, 4] },
          90: { base: 2.6, band: [3, 7] },
          105: { base: 0, band: [0, 2] },
          120: { base: 0.6, band: [1, 3] },
        } as Record<number, { base: number; band: readonly [number, number] }>,
        goal: 0.45,
        substitution: 0.2,
        card: 0.2,
        injury: 0.9,
        jitter: 1.6,
        long: { chance: 0.04, upTo: 10 },
        matchMinutes: 98.3,
        /**
         * The last key moment of a close game (placed at minute 80) lands in second-half added
         * time with this chance, in one of its first `lateAddedMinutes` minutes.
         */
        lateAddedChance: 0.3,
        lateAddedMinutes: 3,
      },
      /**
       * Coming off the bench (review M7). A career player left out of the eleven starts on the
       * bench; from `from` to `to` (and again in extra time, to `extraTo`) the manager brings
       * them on each minute with hazard base[role] × ramp(minute) × score × form × fatigue ×
       * asked. Ramp rises linearly from `ramp[0]` at `from` to `ramp[1]` at `peak`, then eases
       * to `ramp[2]` at `to`. Score: chasing the game, an attacker × `chasing.attack` and a
       * defender × `chasing.defence`; protecting a lead, an attacker × `leading.attack` and a
       * defender × `leading.defence`. Form × (1 + (form − 50) × `form`); fatigue ×
       * (1 − fatigue × `fatigue`); asking at half-time × `asked`. A keeper on the bench comes
       * on only when the starting keeper is injured. Once on, `moments` key moments between
       * two minutes after coming on and the 89th.
       */
      bench: {
        from: 55,
        to: 80,
        extraTo: 105,
        peak: 68,
        base: { key: 0.09, rotation: 0.05, backup: 0.03, youth: 0.02 } as Record<string, number>,
        ramp: [0.5, 1.4, 0.9] as const,
        chasing: { attack: 1.6, defence: 0.6 },
        leading: { attack: 0.8, defence: 1.4 },
        form: 0.012,
        fatigue: 0.008,
        asked: 1.5,
        /** Asking to come on at half-time costs this much trust. */
        askTrust: -2,
        moments: [2, 4] as const,
        /** "Warming up" shows from this minute while on the bench (presentation). */
        warmFrom: 50,
      },
      /**
       * In-match injuries (review M12). Each side's players on the pitch are forced off with a
       * per-minute hazard of `aiPerNinety` ÷ 90 × (0.5 + injury proneness / 100) × (1 + fatigue
       * ÷ `fatigueWeight`) each, drawn per side per minute (`${seed}:injury:…`), replaced from the
       * bench while changes remain. The career player takes a knock with `knock` ÷ 90 a minute ×
       * their injury factor (and a rushed return's risk ÷ 90); a share `serious` of knocks is an
       * injury that ends their match, the rest ask "play on or come off". Playing on adds
       * `playOn.fatigue` fatigue and an aggravation hazard of `playOn.aggravate` a minute, which
       * turns the knock into an injury and ends their match; coming off ends it at once, unhurt.
       */
      injuries: {
        aiPerNinety: 0.012,
        fatigueWeight: 50,
        knock: 0.035,
        serious: 0.25,
        playOn: { fatigue: 20, aggravate: 0.01 },
        /** Keepers are booked too: their card weight × `keeperCard`. */
        keeperCard: 0.3,
      },
      /** One more change for each side in extra time (modern rules), at `extraSub.from`–`to`. */
      extraSub: { chance: 0.75, from: 91, to: 110 },
      /**
       * The shootout: five kicks a side, then sudden death. A kick goes in with base + (taker
       * − 60) × `taker` − (keeper − 60) × `keeper`, less `pressure` for a kick that can lose
       * the shootout, within the bounds. Taker: mean of finishing, composure and set pieces;
       * keeper: mean of reflexes, diving and one-on-ones. The career player, on the pitch, takes
       * one of the first five kicks (their rank among the takers, at most fifth) or, in goal,
       * faces every kick.
       */
      shootout: {
        rounds: 5,
        base: 0.76,
        taker: 0.004,
        keeper: 0.003,
        pressure: 0.04,
        minimum: 0.55,
        maximum: 0.92,
      },
      /**
       * Touchline decisions (review M13). Half-time: motivating lifts momentum by
       * `motivate.momentum` × the score's factor and the second half's odds by `motivate.odds`
       * (`oddsAhead` when ahead), with `motivate.trust`. Asking for a role is refused with
       * `role.base` − (trust − 50) × `role.trust` + `role.against` when the request runs
       * against the score (more attack when ahead, more caution when behind), within the
       * bounds; refused, it costs `role.refusedTrust` and odds × `role.refusedOdds`. Demanding
       * the ball costs `demand.trust`, `demand.earned` with a first-half rating of at least
       * `demand.rating`, `demand.poor` below `demand.poorRating`. The captain calls the tone at
       * the second half's start, after conceding and at `captain.lateMinute` in a close game, at
       * most `captain.maximum` times, `captain.gap` minutes apart. Accepting a substitution
       * earns `substitution.acceptTrust`; rallying the side as you go off scales its expected
       * goals by `substitution.rally.own` and the opposition's by `rally.against` for the rest
       * of the match instead. Demanding the ball raises the attacking share × `demand.share`
       * and adds `demand.moments` key moments, one in each 15 minutes from `demand.from`.
       */
      touchline: {
        motivate: {
          momentum: 8,
          behind: 1.25,
          level: 1,
          ahead: 0.4,
          odds: 1.03,
          oddsAhead: 1.005,
          trust: 1,
        },
        role: {
          base: 0.3,
          trust: 0.008,
          against: 0.25,
          minimum: 0.05,
          maximum: 0.85,
          refusedTrust: -1,
          refusedOdds: 0.98,
        },
        demand: {
          trust: -2,
          earned: 0,
          rating: 7,
          poor: -4,
          poorRating: 6.2,
          share: 1.35,
          moments: 2,
          from: 50,
        },
        bench: { momentum: 0.5 },
        captain: { lateMinute: 80, maximum: 3, gap: 10, lastMinute: 88 },
        substitution: { acceptTrust: 1, rally: { own: 1.3, against: 0.85 } },
      },
    },
    xp: {
      perMinute: 0.5,
      ratingThreshold: 5.5,
      perRating: 50,
      perGoal: 40,
      perAssist: 28,
      perObjective: 15,
    },
    fame: { ratingThreshold: 6.3, perRating: 3, perGoal: 1.5, perAssist: 1, perCleanSheet: 1.5 },
    /**
     * XP and fame from a match-22 rating (release 1.0 step 5.3); minutes, goals, assists,
     * objectives and clean sheets pay as in `xp` and `fame`. The compressed scale moves the
     * rating term: per rating point above `ratingThreshold`, `perRating` × the weight of the
     * position played (`position`). The weights keep each position's XP a match (median and
     * mean over the match profile) within 5% of match-21's, where keepers' and defenders'
     * ratings ran high, and fame within 8%; over all positions both stay where they were.
     */
    rewards22: {
      xp: { ratingThreshold: 5.2, perRating: 45 },
      fame: { ratingThreshold: 6.2, perRating: 3.75 },
      position: {
        GK: 1.3,
        CB: 1.21,
        LB: 1,
        RB: 1,
        DM: 0.9,
        CM: 0.78,
        AM: 0.78,
        LW: 0.78,
        RW: 0.78,
        ST: 0.85,
      } as Record<string, number>,
    },
    /** Personal objectives: a rating target and one drawn for the position each match. */
    objectives: {
      rating: 7,
      /** Passing target: the player's routine completion plus a margin, within the range. */
      passingMargin: -3,
      passingRange: [65, 90] as const,
      tackles: { defender: 3, midfield: 2 },
      saves: 5,
      shots: { striker: 5, other: 3 },
      /**
       * Decision chains (match-22, X1a) set one objective, with targets for a match of four to
       * six chains: fewer of the player's own shots, tackles and saves than a match of key
       * moments had.
       */
      chains: { tackles: { defender: 1, midfield: 1 }, saves: 2, shots: { striker: 2, other: 1 } },
    },
  },
  /** Career player progression (milestone 4). See docs/BALANCING.md. */
  career: {
    /**
     * The manager's pre-match plan on the hub (`career/brief.ts`, phase 7 C2). The player
     * "starts" when picked, or for a later fixture when the selection chance is at least
     * `startChance`. The outlook compares the two sides' expected goals: favourites at
     * `outlookGoals` or more ahead, underdogs as far behind. A culture value of `trait` or more
     * colours the plan's closing line, the youth line for players up to `youthAge`.
     */
    brief: { startChance: 0.5, outlookGoals: 0.35, trait: 65, youthAge: 21 },
    /**
     * End-of-season review grade (0–100): playing time (share of the club's matches), the
     * average rating from `ratingFloor` over `ratingSpan`, goal involvements (or clean sheets) a
     * match against the position's reference, a trophy, up to two season awards, and the club's
     * title or promotion (relegation counts against). Grades from the bands.
     */
    /**
     * Story arcs (`stories/storylets.ts`): at most one open; a new one at least `gapWeeks`
     * after the last, on `weeklyChance` of weeks unless an occasion (weight ≥ `occasionWeight`:
     * a new manager, a comeback, a homecoming, a derby) brings one at once. Each kind once a
     * season; the last `limit` are kept. The rest are the thresholds and sizes of each story.
     */
    /**
     * Preseason (review phase 5, step 5.3): the briefing is offered in the season's first
     * `weeks`. Ambitions: a regular place is `placeShare` of the club's league fixtures
     * started; output targets by line (goals and assists, or clean sheets for the back line);
     * growth is `growth` ability points, or holding ability from `holdAge`. Met: `reward`;
     * missed: `penalty` morale. Late-career steps from `lateAge`: a smaller role earns
     * `smallerTrust` trust; a new position starts at `retrain` familiarity more; home clubs show
     * `homeConfidence` interest.
     */
    preseason: {
      weeks: 6,
      placeShare: 0.6,
      output: { ATT: 14, MID: 9, DEF: 3, GK: 0 },
      cleanSheets: { DEF: 9, GK: 11 },
      growth: 3,
      holdAge: 29,
      reward: { xp: 300, fame: 8, morale: 6 },
      penalty: -4,
      lateAge: 31,
      smallerTrust: 8,
      retrain: 25,
      homeClubs: 2,
      homeConfidence: 70,
    },
    /**
     * Lasting story facts (review phase 5, step 5.2). Each grievance a manager holds (a
     * challenge missed, public criticism, a transfer request under them) lowers the most they
     * can trust the player by `grievance`, to `trustFloor`. A club renews `loyalty` times as
     * willingly after a declaration of loyalty, `request` times within `requestSeasons` of a
     * transfer request. The captaincy claim gains or loses `captaincy` points by kind. A
     * mentee who becomes a manager starts with `menteeTrust` more trust. Stories rest
     * `cooldown` seasons by kind (1 means only once a season).
     */
    facts: {
      limit: 60,
      grievance: 12,
      trustFloor: 60,
      loyalty: 1.5,
      request: 0.5,
      requestSeasons: 2,
      captaincy: {
        'declared-loyalty': 10,
        mentored: 5,
        captain: 5,
        'promise-kept': 5,
        'public-criticism': -15,
        'transfer-request': -10,
      } as Partial<Record<string, number>>,
      menteeTrust: 20,
      menteeManagerChance: 0.6,
      cooldown: {
        'senior-dispute': 2,
        captaincy: 2,
        'contract-envy': 2,
        'rival-war': 2,
        'transfer-saga': 2,
        'mentor-youth': 2,
        charity: 1,
        'night-out': 1,
      } as Partial<Record<string, number>>,
    },
    stories: {
      gapWeeks: 4,
      weeklyChance: 0.3,
      occasionWeight: 3,
      limit: 40,
      disputeTrust: 55,
      mentorAge: 24,
      mentorGain: 3,
      mentorXp: 250,
      captaincyAge: 23,
      captaincyTrust: 65,
      captaincyMatches: 8,
      captaincySpread: 20,
      newManagerForm: 55,
      rivalIntensity: 45,
      sagaGap: 6,
      comebackWeeks: 6,
      comebackRating: 6.8,
      charityFame: 3,
      charityGift: 1000,
      nightOutRisk: 0.25,
      envyRatio: 1.3,
    },
    review: {
      weights: {
        playingTime: 30,
        rating: 30,
        contribution: 20,
        trophy: 8,
        award: 6,
        clubSuccess: 6,
      },
      ratingFloor: 6,
      ratingSpan: 1.4,
      contribution: {
        ST: 0.6,
        LW: 0.5,
        RW: 0.5,
        AM: 0.5,
        CM: 0.3,
        DM: 0.35,
        LB: 0.35,
        RB: 0.35,
        CB: 0.35,
        GK: 0.35,
      },
      grades: { 'A+': 90, A: 78, B: 64, C: 50, D: 36 },
    },
    /** XP needed from level n to n + 1 is levelXpBase × levelXpGrowth^(n − 1). */
    levelXpBase: 500,
    levelXpGrowth: 1.02,
    maximumLevel: 99,
    attributePointsPerLevel: 5,
    /** Careers saved before schema 17 earned this many a level and climbed this curve;
     * validation allows a level reached under either. */
    legacyAttributePointsPerLevel: 8,
    legacyLevelCurve: { base: 300, growth: 1.06 },
    skillPointsPerLevel: 1,
    /** Fixture importance multiplies match XP and powers big-game skills. */
    importance: { league: 1, phase: 1.1, cup: 1.15, tie: 1.25, final: 1.5 },
    /** XP multiplier from the opposition's reputation: base + reputation × slope, in range. */
    oppositionBase: 0.75,
    oppositionSlope: 0.005,
    oppositionRange: [0.6, 1.3] as const,
    /** XP for each successful key-moment decision, more when its odds were below a half. */
    decisionXp: { success: 4, underdog: 8 },
    /** Attribute point costs relative to the age-adjusted soft cap. */
    costs: {
      belowCap: 1,
      nearCap: 2,
      beyondCap: 3,
      capMargin: 5,
      /** Beyond cap + capMargin the cost rises by one for every this many points. */
      beyondCapStep: 4,
      /** Before hardCapAge an attribute cannot be raised past cap + hardCapMargin. */
      hardCapMargin: 12,
      hardCapAge: 24,
      physicalAge: 29,
      physicalSurcharge: 1,
    },
    /**
     * Passive development: the career player's attributes below their age-adjusted cap drift
     * toward it, faster with playing time, so points buy emphasis rather than existence.
     */
    development: {
      /** Fraction of the gap to the cap closed per season at full playing time. */
      growthPerSeason: 0.35,
      /** Share of that growth that depends on recent minutes; the rest comes regardless. */
      playingWeight: 0.5,
      /** Matches counted for recent playing time (original rules). */
      recentMatches: 8,
      /**
       * Development rules 2: playing time is minutes over the last `fixtures` club fixtures the
       * player was available for (played or left out while fit), within a season's length of
       * weeks; injuries and registration gaps are skipped. `fallback` with none to count;
       * `limit` fixtures are kept.
       */
      availability: { fixtures: 8, fallback: 0.5, limit: 16 },
      /**
       * Development rules 3: passive growth favours the attributes the training plan focuses
       * on, this many times as fast as the rest, with the same average over all attributes.
       */
      focusRatio: 2,
    },
    /**
     * Late career (development rules 2): from an onset age the career player's soft caps fall
     * and decline speeds up every season, so playing on is a real trade-off. Longevity (0-1)
     * postpones the onset and softens both. See docs/BALANCING.md.
     */
    /** Seasons of growth-by-source kept on the career (`career.growth`). */
    growthSeasons: 25,
    longevity: {
      /** Age at which decline starts to accelerate for a player with no longevity. */
      onsetAge: 33,
      /** Keepers last longer: their onset is this much later. */
      keeperOnset: 2,
      /** Seasons full longevity postpones the onset. */
      onsetShift: 3,
      /** Longevity from skills; together they make up half the score. */
      skills: {
        engine: 0.08,
        powerhouse: 0.04,
        'iron-man': 0.08,
        'second-wind': 0.08,
        professional: 0.04,
        evergreen: 0.18,
      } as Record<string, number>,
      /**
       * Conditioning: a running share of training given to physical work (recovery counts
       * `recoveryShare`; for keepers, whose physical attributes are untrained, it counts fully).
       * Each week moves the share `weekly` of the way toward that week's plan. Scored linearly
       * from `from` to `to`.
       */
      conditioning: { weight: 0.25, weekly: 1 / 120, recoveryShare: 0.5, from: 0.15, to: 0.6 },
      /** Physique: average stamina and strength, scored from `from` to `to`; keepers neutral. */
      physique: { weight: 0.15, from: 50, to: 85 },
      /** Character: professionalism up, injury proneness down; 0.5 of this weight on average. */
      character: { weight: 0.1 },
      /** Each late season multiplies the decline rate by this (less `rateSoftening` × longevity). */
      rate: 1.5,
      rateSoftening: 0.25,
      /** Soft-cap share lost by category, times late seasons ^ 1.5, less capSoftening × longevity. */
      capDrop: { pace: 0.05, physical: 0.045, technical: 0.03, keeper: 0.035, mental: 0.012 },
      capSoftening: 0.4,
      maxDrop: 0.5,
    },
    start: {
      ageRange: [16, 18] as const,
      potential: [74, 88] as const,
      /** Starting attributes sit this far below the trial club's squad average... */
      belowClub: 3,
      /** ...plus the archetype's emphasis, scaled by this factor. */
      emphasisScale: 2.5,
      noise: 2,
      offers: 3,
    },
    /** Coaching (Phase 5.2): advice from recent decisions and a season development goal. */
    coaching: {
      /** Decisions kept for advice. */
      recentLimit: 40,
      /** Fewer decisions than this give a position-based plan instead of advice. */
      minimumDecisions: 10,
      /** A kind of decision needs this many attempts before advice speaks to it. */
      minimumAttempts: 4,
      /**
       * Successes this far below what the decisions' chances predicted are noted as bad luck
       * (outcomes are drawn at the odds shown, so this never asks for training).
       */
      shortfall: 1.5,
      /** Attributes costing this much success chance a decision (0.03 = 3 points) call for training. */
      execution: 0.03,
      /** Choices giving up this much expected goal difference a decision are noted. */
      regret: 0.015,
      /** At or above this fatigue, recovery comes first. */
      fatigue: 60,
      goals: {
        appearances: { key: 30, rotation: 22, backup: 12, youth: 14 },
        passes: 600,
        tackles: 30,
        attributeGain: 6,
      },
      historyLimit: 10,
    },
    training: {
      sessions: 3,
      gain: { low: 0.09, normal: 0.13, high: 0.24 },
      mentorGain: 0.12,
      /** Mentor quality multiplies gain by up to 1 + this, from the mentor's lead in the focus. */
      mentorBonus: 0.5,
      fatigue: { low: 0.5, normal: 1.5, high: 4, extra: 2, recovery: -8, opponent: 0.5 },
      injuryRisk: { low: 0.002, normal: 0.005, high: 0.009, extra: 0.004 },
      /** Training injury risk by age: the young recover, the old break. */
      injuryAgeFactor: { under21: 0.7, over30: 1.3 },
      /** Learning speed by age: [age, multiplier]. */
      ageLearning: [
        [16, 1.3],
        [20, 1.15],
        [24, 1],
        [28, 0.85],
        [32, 0.65],
        [36, 0.5],
      ] as const,
      familiarity: { low: 2, normal: 4, high: 6 },
      /** Familiarity gained per ninety minutes played in a secondary position. */
      familiarityPerMatch: 3,
      /** Training progress above the soft cap is slowed by this factor and stops at cap + margin. */
      beyondCapFactor: 0.5,
      professionalSkill: 1.2,
      secondWindSkill: 0.7,
    },
    injuries: {
      /** Per 90 minutes played; a match's chance scales with the minutes (floor `minuteFloor`). */
      matchChance: 0.008,
      minuteFloor: 0.1,
      ironManSkill: 0.5,
      fatigueWeight: 50,
      types: [
        { kind: 'knock', weight: 30, weeks: [1, 2], severity: 1, threatening: 0 },
        { kind: 'muscle-strain', weight: 22, weeks: [2, 4], severity: 2, threatening: 0 },
        { kind: 'ankle-sprain', weight: 16, weeks: [2, 5], severity: 2, threatening: 0 },
        { kind: 'hamstring-strain', weight: 14, weeks: [3, 6], severity: 3, threatening: 0 },
        { kind: 'groin-strain', weight: 8, weeks: [3, 6], severity: 3, threatening: 0 },
        { kind: 'calf-tear', weight: 6, weeks: [5, 9], severity: 3, threatening: 0 },
        { kind: 'broken-foot', weight: 2.5, weeks: [8, 14], severity: 4, threatening: 0 },
        { kind: 'knee-ligament', weight: 1.2, weeks: [16, 30], severity: 5, threatening: 0.25 },
      ] as const,
      /** A rushed return: this share of the time out, then a per-match re-injury risk for six weeks. */
      rush: { durationFactor: 0.5, reinjuryPerSeverity: 0.02 },
      /** A career-threatening injury permanently costs these attribute points. */
      threateningLoss: { pace: 12, acceleration: 12, agility: 6, jumping: 6 },
    },
    /** Hidden attributes revealed at these appearance counts, in this order. */
    reveal: {
      appearances: [5, 15, 30, 50, 80] as const,
      order: [
        'professionalism',
        'consistency',
        'injuryProneness',
        'bigMatchTemperament',
        'ambition',
      ] as const,
    },
    historyLimit: 2000,
    /** A new career starts its first this many fixtures, whatever the selection (release 1.0 X1a). */
    debutStarts: 2,
    /** Contracts, agents, transfers and loans (milestone 5). See docs/BALANCING.md. */
    market: {
      /**
       * Contract expiry once the club's option is used: up to `offers` scouting clubs open
       * pre-contract talks when the season ends; the club's one-season bridge is the default.
       */
      expiry: { offers: 3 },
      /** Transfer windows as [first, last] fractions of the season's weeks. */
      windows: [
        [0, 0.13],
        [0.47, 0.55],
      ] as const,
      /** Market value: valueAtAbility × e^(valueSlope × (ability − referenceAbility)). */
      valueAtAbility: 150_000,
      referenceAbility: 80,
      valueSlope: 0.07,
      /** Young players are valued for upside: 1 + gap × youthUpside, at most youthCap. */
      youngAge: 21,
      youthUpside: 0.03,
      youthCap: 2.5,
      primeUpside: 0.015,
      /** Value multiplier from age 28, falling by veteranStep each year after 30. */
      peakAge: 28,
      peakFactor: 0.85,
      veteranStep: 0.12,
      minimumAgeFactor: 0.2,
      /** Value multiplier by full seasons left on the contract after this one: 0, 1, 2+. */
      contractFactor: [0.55, 0.8, 1] as const,
      /** Wage multiplier by squad role, on top of the generation wage formula. */
      roleWage: { key: 1.15, rotation: 1, backup: 0.85, youth: 0.8 },
      /** A selling club's asking price as a multiple of value, by the player's role there. */
      askingFactor: { key: 1.5, rotation: 1.2, backup: 0.9, youth: 1.1 },
      transferRequestDiscount: 0.85,
      openingBid: 0.8,
      /** A buyer bids up to value × (1 + confidence × bidConfidenceWeight), within its budget. */
      bidConfidenceWeight: 0.01,
      /** Lines a squad fields, for the role a player can be promised. */
      slots: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
      /** Selection: chance of starting by role, then adjustments. */
      selection: {
        base: { key: 0.97, rotation: 0.85, backup: 0.45, youth: 0.6 },
        inTeam: 0.08,
        perPlaceOutside: 0.08,
        maximumPlacesOutside: 4,
        form: 0.003,
        trust: 0.002,
        tiredFatigue: 70,
        tired: 0.15,
        minimum: 0.05,
        /** A key player's floor applies only while they are at most this many places outside. */
        keyFloor: 0.75,
        keyFloorPlaces: 1,
        /** Share of matchdays a promise guarantees; below it the promise is broken. */
        promise: { key: 0.8, rotation: 0.5 },
        /** A broken promise halves the release clause, so a move costs the next club less. */
        brokenClauseFactor: 0.5,
        promiseMinimumMatchdays: 10,
      },
      /** Interest and scouting. */
      scouting: {
        /** Visibility by the player's division tier (index 0 = tier 1). */
        visibility: [1, 0.85, 0.7, 0.55, 0.45, 0.4] as const,
        foreign: 0.35,
        startChance: 0.04,
        maximumTransfer: 5,
        maximumLoan: 4,
        /** Interested clubs' level against the player's projected ability. */
        bandBelow: 6,
        bandAbove: 10,
        projectedUpside: 0.3,
        projectedCap: 10,
        /** Confidence gain per week: performance × gain × (1 + network bonus) − decay. */
        gain: 10,
        decay: 3,
        noise: 2,
        idleDecay: 4,
        scoutingAt: 35,
        offerAt: 70,
        loanOfferAt: 50,
        weeks: 4,
        loanWeeks: 2,
        offerChance: 0.25,
        maximumOpenOffers: 2,
        /** After a declined, lapsed or collapsed offer the club waits this long to bid again. */
        declineCooldownWeeks: 20,
        declineConfidence: 25,
        /** Recent ratings: the last n matches within this many weeks. */
        recentMatches: 6,
        recentWeeks: 12,
        neutralRating: 6,
      },
      negotiation: {
        offerWeeks: 3,
        renewalWeeks: 4,
        /** The club's wage ceiling above its opening offer, plus agent and desire bonuses. */
        wageStretch: 0.12,
        /** Agents stretch the club's limits by their skill, by personality. */
        agentStretch: { aggressive: 0.004, connected: 0.0025, economical: 0.001 },
        desireStretch: 0.0025,
        openingWage: 0.95,
        /** The club walks away above a hidden multiple of its opening wage, drawn in this range. */
        walkAway: [1.2, 1.35] as const,
        /** A counter moves the club this share of the gap toward the player's ask. */
        counterShare: 1 / 3,
        /** Asking above the limits on this many items at once risks the club walking away. */
        overAskItems: 3,
        overAskWalkChance: 0.2,
        /** Every counter in renewal talks costs manager trust. */
        renewalCounterTrust: -2,
        patience: 2,
        agentPatienceAt: 60,
        /** A key role is conceded one step above the club's view only with this confidence. */
        roleConfidence: 85,
        minimumClauseFactor: 1.5,
        defaultClauseFactor: 2.5,
        signingBonusWeeks: 4,
        maximumSigningBonusWeeks: 6,
        agentBonusWeeks: 0.05,
        /** The agent's estimate of the wage ceiling is off by up to (100 − skill) / estimateError. */
        estimateError: 250,
        maximumYears: 5,
      },
      loans: {
        wageShare: [0.5, 1] as const,
        purchaseOptionChance: 0.35,
        purchaseOptionFactor: 1.1,
        purchaseRating: 6.8,
        selectionBelow: 0.4,
        droppedMatchdays: 3,
        requestedChance: 0.5,
        chance: 0.15,
      },
      renewal: {
        /** Final-season renewal talks open from this fraction of the season. */
        finalSeasonFrom: 0.25,
        chance: 0.25,
        /** Underpaid by this much, the club may improve terms unprompted. */
        underpaid: 1.4,
        improveChance: 0.1,
        askUnderpaid: 1.15,
        askCooldownWeeks: 8,
        minimumTrust: 35,
      },
      transferRequest: {
        trust: -15,
        fans: -10,
        withdrawTrust: 5,
        withdrawFans: 3,
        brokenTrust: -5,
      },
      relationships: { trust: 55, fans: 50, newManager: 50, renewalTrust: 5 },
      agents: {
        pool: 8,
        changeCooldownWeeks: 4,
        pitchChance: 0.001,
        connectedPitch: 1.5,
        /** A connected agent's reach abroad: 1 + network / this. */
        foreignReach: 60,
        adviceWeeks: 8,
        underpaid: 1.3,
      },
      /** Standing for agents: ability, club reputation and fame. */
      standing: { ability: 0.55, reputation: 0.45, fameDivisor: 25, fameCap: 15 },
      bonusDefenders: ['GK', 'CB', 'LB', 'RB'] as const,
      sellOnAge: 23,
      sellOnPercent: 10,
      inboxLimit: 200,
      /** A buying club must stand this much above the parent in reputation (negative: better),
       * or this much below it after a transfer request. */
      upwardStep: -3,
      requestUpwardStep: 10,
    },
    /** Morale, relationships, dressing room, rival and media (milestone 6). See BALANCING.md. */
    /** The manager's development promise (Phase 6). */
    promise: {
      /** The milestone runs this many weeks from acceptance. */
      weeks: 6,
      /** Weeks to answer the offer, including the week it arrives. */
      respondWeeks: 2,
      /** Fewer club fixtures than this in the window turn a match milestone into training. */
      minimumFixtures: 3,
      targets: { appearanceShare: 0.67, passes: 140, tackles: 10, attribute: 3 },
      /** Manager trust and fan affection when the milestone is met or missed. */
      trust: { achieved: 6, missed: -3 },
      fans: { achieved: 5, missed: -3 },
      historyLimit: 10,
    },
    social: {
      historyLimit: 160,
      /** Weekly morale moves this share of the way to its target. */
      moraleStep: 0.3,
      moraleBase: 50,
      /** Morale target parts, each bounded by its limit. */
      morale: {
        resultsPerPoint: 3,
        resultsLimit: 12,
        playingTime: 10,
        trust: 0.2,
        chemistry: 0.2,
        dressingRoom: 0.15,
        cultureFit: 0.2,
        fans: 0.1,
        media: 0.6,
        injury: -8,
        transferRequest: -5,
        partLimit: 10,
        /**
         * A revealed ambition as a stated preference (review phase 4, step 4.2). High ambition
         * wants top-division football by `summit.age`: `met` there, `behind` per season past it.
         * Middling ambition wants to be a regular: `met` picked for `regular` of matchdays or
         * more, `missed` below `fringe`. Low ambition values staying: `met` from `settled`
         * seasons at a club, `moved` in a first season after a move.
         */
        drive: {
          summit: { from: 70, age: 24, met: 4, behind: -2, limit: 6 },
          starter: { from: 40, regular: 0.75, fringe: 0.4, met: 3, missed: -4, matchdays: 3 },
          roots: { settled: 2, met: 3, moved: -3 },
        },
      },
      /** Without a match, form drifts back toward this level. */
      formRest: 50,
      formRestStep: 0.1,
      /** Key-moment odds × (1 + (morale − neutral) × slope), within the bounds. */
      matchMorale: { neutral: 65, slope: 0.004, minimum: 0.88, maximum: 1.12 },
      /** Manager trust and fan affection drift toward this level each week, so standing
       * has to be kept up. */
      relationshipDecay: { toward: 60, rate: 0.03 },
      /** A chance made for a teammate: successGoal × (1 + (chemistry − 60) × slope). */
      chemistry: { slope: 0.004, minimum: 0.85, maximum: 1.15 },
      /** Culture fit multiplies training gains: base + range × fit/100. */
      cultureTraining: { base: 0.8, range: 0.4 },
      /** A stance taken to the press is judged by the next result. */
      stance: {
        confident: { win: { fame: 2 }, loss: { fame: -2, fans: -3 } },
        provocative: { win: { fame: 3 }, loss: { fame: -3, fans: -4, trust: -2 } },
        humble: { win: { trust: 3 }, loss: {} },
      },
      /** Cliques: ages and the minimum size for an international group. */
      cliques: {
        youngAge: 22,
        seniorAge: 29,
        internationalsMinimum: 3,
        ownAffinity: 60,
        otherAffinity: 45,
        drift: 0.05,
        moodPull: 0.3,
        goodRating: 7.5,
        poorRating: 5.5,
        /** The same bands on engine match-22's ratings (release 1.0 step 5.3). */
        ratings22: { goodRating: 7.25, poorRating: 6.05 },
        performance: 1.5,
        transferRequest: -8,
        seniorsTransferRequest: -4,
        trustFromSeniors: 0.3,
      },
      mood: { retention: 0.85, perResult: 6, affinity: 0.2, recentResults: 5 },
      teammates: {
        count: 6,
        base: 50,
        sameClique: 8,
        sameNationality: 4,
        sociability: 0.2,
        temperamentClash: 0.1,
        cultureFit: 0.1,
        weekly: 0.5,
        playedTogether: 1,
        pull: 0.1,
        cliqueInfluence: 0.02,
        keepFormer: 30,
      },
      /** Manager trust and fan affection from match performances. */
      performance: {
        greatRating: 7.5,
        goodRating: 6.8,
        poorRating: 5.5,
        /**
         * The bands on engine match-22's compressed ratings (release 1.0 step 5.3), keeping
         * the shares of the match profile's matches: 27% great, 45% good or better, 21% poor.
         */
        ratings22: { greatRating: 7.25, goodRating: 6.65, poorRating: 6.05 },
        trust: { great: 2, good: 1, poor: -2 },
        fans: { great: 2, good: 1, poor: -1.5, goal: 1 },
      },
      rival: {
        ageRange: 1,
        abilityRange: 6,
        potentialSpread: 2,
        startIntensity: 30,
        headToHead: 6,
        media: 3,
        seasonEnd: 4,
        outgrown: 4,
        moveChance: 0.35,
        timelineLimit: 60,
        compareEvery: 8,
        /** A season's worth by line (review phase 3): what a clean sheet counts for. */
        output: { keeperCleanSheet: 2, defenderCleanSheet: 1.5 },
      },
      media: {
        limit: 150,
        pressWeeks: 2,
        /** Weeks before the press asks about the same topic again. */
        topicCooldown: 6,
        /** The press quotes an answer back within this many weeks (`recall` in media.ts). */
        recallWeeks: 5,
        silenceFame: -1,
        fanPosts: 2,
        journalistChance: 0.5,
        pressChance: 0.5,
        rivalPressChance: 0.1,
        rumourChance: 0.2,
        bigMatchChance: 0.6,
        coverageDecay: 0.8,
        likesPerFame: 0.5,
      },
    },
    /**
     * Weekly commitments outside training (review phase 4, step 4.4): at most `slots` a week,
     * each with its effects every week it is kept. Morale moves 30% of the way to its target
     * each week and standing drifts back 3%, so a weekly bump b settles at about b / 0.3
     * morale (family +4, a team social +2) and b / 0.03 fan affection (community +10). Mentoring needs `minimumAge` and a teammate
     * under 21; sponsor appearances need an active deal and pay `feeShare` of its weekly fee.
     */
    commitments: {
      slots: 3,
      mentoring: { xp: 25, young: 0.8, fatigue: 1.5, minimumAge: 23 },
      sponsor: { fame: 0.5, feeShare: 0.15, fatigue: 1 },
      community: { fans: 0.3, fame: 0.25, fatigue: 1 },
      'team-social': { cliques: 0.5, mood: 0.5, morale: 0.6, fatigue: 1 },
      family: { morale: 1.2 },
      rest: { fatigue: -3 },
    },
    /** Fame, sponsorships, lifestyle, wardrobe, celebrations and challenges (milestone 7). */
    lifestyle: {
      /**
       * Staff specialities (review phase 4, step 4.4): injury chance × `prevention`, fatigue
       * relief `recovery` a week, training fatigue × `endurance`, training gains ×
       * `development`, extra-session gains × `mentoring`, `decisions` XP per key decision
       * that comes off. A scouting analyst prepares the player for every opponent.
       */
      staff: {
        prevention: 0.8,
        recovery: 2,
        endurance: 0.85,
        development: 1.15,
        mentoring: 1.3,
        decisions: 2,
      },
      /** Fame needed for levels 1–10. */
      fameLevels: [0, 20, 50, 100, 170, 260, 380, 530, 720, 950] as const,
      /** At each new season fame above the floor fades by this share: fame is a standing. */
      fameDecay: { above: 100, share: 0.1 },
      /**
       * Legacy projects at the first club: a stake adds this share of its price to the club's
       * transfer budget and `stakeReputation` to its standing each season it is held; an
       * academy adds `academyPotential` to every youngster it brings through. Fans there warm.
       */
      legacy: { stakeBudget: 0.5, stakeReputation: 1, academyPotential: 6, fans: 8 },
      /** Active sponsorship deals allowed at each fame level. */
      maxDeals: [0, 1, 1, 2, 2, 2, 3, 3, 3, 4] as const,
      sponsor: {
        offerChance: 0.15,
        offerWeeks: 3,
        /** Weekly fee: feeBase × feeGrowth^(level − 1) × brand scale. */
        feeBase: 30,
        feeGrowth: 1.6,
        bonusWeeks: 8,
        completedFame: 3,
        /** A failed deal: fame −(failedFame + level), a share of the fees clawed back, and the
         * category closed for lockSeasons. A completed deal renews at renewalFactor. */
        failedFame: -3,
        clawback: 0.25,
        lockSeasons: 2,
        renewalFactor: 1.25,
        /** Obligation targets per remaining season fraction. */
        starts: 0.45,
        goals: 0.25,
        cleanSheets: 0.2,
        press: 0.08,
        /** Sponsor appearances, a weekly commitment (review phase 4): per remaining fixture. */
        appearances: 0.15,
        rating: 6.6,
        image: 45,
      },
      /** Signature celebration: fame per goal in a match of at least this importance. */
      signatureFame: 2,
      bigMatchImportance: 1.15,
      moraleLimit: 8,
      /** Upkeep above this share of weekly income (wage and sponsors) weighs on morale. */
      overspendShare: 0.5,
      overspendMorale: -3,
      resale: 0.6,
      /** Cars, homes and experiences cost their wage-weeks; upkeep is price ÷ this a week. */
      upkeepDivisor: 250,
      /** Hiring staff costs this many weeks of their salary up front. */
      hireWeeks: 4,
      /** Weekly investment returns: mean ± spread; a start-up can fold (chance a week). */
      investments: {
        bond: { mean: 0.001, spread: 0 },
        fund: { mean: 0.0025, spread: 0.012 },
        startup: { mean: 0.004, spread: 0.08 },
      },
      startupFoldChance: 0.0004,
      /** Charities: fame arrives every this many weeks. */
      charityFameWeeks: 4,
      /** Experiences can be taken again after this many weeks. */
      experienceCooldownWeeks: { holiday: 8, family: 4 } as Record<string, number>,
      /** A family visit steadies morale: this much on the weekly morale target for `weeks`. */
      familyMorale: { morale: 3, weeks: 4 },
      investmentAmounts: [1_000, 5_000, 10_000, 25_000, 50_000, 100_000] as const,
      challenges: {
        daily: 3,
        weekly: 3,
        dailyTokens: 10,
        weeklyTokens: 40,
        weeklyCosmeticChance: 0.5,
      },
    },
    /** National team, awards, retirement, legacy, Chronicle and Moments (milestone 8). */
    honours: {
      international: {
        /** International windows as fractions of the season, each with two matches. */
        windows: [0.18, 0.42, 0.68] as const,
        matchesPerWindow: 2,
        squad: { GK: 3, DEF: 8, MID: 7, ATT: 5 },
        ages: { U19: 19, U21: 21 },
        /** Selection score: ability + form × form + min(fameCap, fame × fame). At youth levels
         * the career player counts by projected ability, as academy players effectively do. */
        selection: { form: 0.1, fame: 0.03, fameCap: 14 },
        starterSlots: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
        benchChance: 0.4,
        baseGoals: 1.3,
        strengthScale: 0.035,
        goalShare: { GK: 0, DEF: 0.04, MID: 0.12, ATT: 0.28 },
        assistShare: { GK: 0, DEF: 0.05, MID: 0.14, ATT: 0.12 },
        youthRating: 10,
        fame: { cap: 1, goal: 2, tournament: 10 },
        xp: { cap: 120, goal: 30 },
        matchLimit: 120,
        tournamentLimit: 30,
        /** Tournaments played round by round (review phase 3): fixture importance by stage. */
        tournament: { importance: { group: 1.15, knockout: 1.3, final: 1.5 } },
        /** Window matches the player plays (version 0.9.0): fixture importance by kind. */
        window: { importance: { qualifier: 1.1, friendly: 1 } },
        /**
         * Qualification (review phase 3, step 3.3): six groups of four, home and away; the
         * winners, runners-up and best thirds go through. The home side plays a point above
         * its rating.
         */
        qualifying: { groups: 6, bestThirds: 4, homeBonus: 1 },
      },
      awards: {
        monthWeeks: 5,
        monthMinimumApps: 2,
        seasonMinimumApps: 10,
        youngAge: 21,
        /** Score: average rating × rating + goals × goal + assists × assist, times the league
         * tier's visibility for Young Player and the Golden Ball. */
        score: {
          rating: 10,
          goal: 1.5,
          assist: 1,
          monthGoal: 0.6,
          monthAssist: 0.4,
          /** Per clean sheet, for keepers and defenders (complete statistics). */
          cleanSheet: { keeper: 1.2, defender: 0.9 },
        },
        /** Golden Ball bonuses for team success. */
        champion: 10,
        topFour: 5,
        continentalWinner: 10,
        continentalFinal: 5,
        tournamentWinner: 8,
        shortlist: 10,
        /** Awards kept before the oldest ones nobody's career names are dropped. */
        recordLimit: 400,
        /**
         * The most a save may hold. Careers' awards and Golden Balls are never dropped, so they
         * add to the record limit: at most a Golden Ball and 20 career awards a season (12 months,
         * three awards in each of two leagues, young player, Golden Ball), 4,600 after 200
         * seasons in the worst case; about 5 a season in practice (retention, step 3.6).
         */
        maxRecords: 5000,
        fame: { month: 3, season: 6, goldenBall: 25, shortlist: 5 },
      },
      /**
       * Retirement is optional from optionalAge and forced at forcedAge. Before development rules
       * 2 it was also forced from declineAge below declineShare of peak; now that only prompts
       * advice, and late decline itself discourages playing on (career.longevity).
       */
      retirement: { optionalAge: 32, forcedAge: 38, declineAge: 33, declineShare: 0.78 },
      /**
       * Moments: a late goal from `lateMinute`, a wonder goal at odds up to `wonderProbability`;
       * for every position (review phase 3): a save at odds up to `greatSave` from
       * `defensiveMinute` with the game within a goal, and a successful last-ditch challenge.
       */
      /** Chronicle landmarks for every position (review phase 3). */
      milestones: { cleanSheets: [25, 50, 100, 200, 300], assists: [25, 50, 100, 150, 200] },
      moments: {
        limit: 40,
        lateMinute: 85,
        wonderProbability: 0.2,
        greatSave: 0.35,
        defensiveMinute: 70,
      },
      /** Hall of Fame score. */
      /**
       * Ambitions the player chooses for the career: at most `count`, changed once a season.
       * Each achieved one pays fame and XP; targets are career totals (caps: senior).
       */
      /** Announcing the last season: the fame of the farewell. */
      farewell: { fame: 15 },
      /** A testimonial after this many seasons at one club: fame and the fans' affection. */
      testimonial: { seasons: 8, fame: 20, fans: 10 },
      /** Ambitions are under honours; the season review grade lives in `career.review`. */
      ambitions: {
        count: 3,
        targets: {
          goals: 150,
          assists: 100,
          'clean-sheets': 150,
          appearances: 500,
          caps: 50,
          'one-club': 8,
          'hall-of-fame': 50,
        },
        reward: { fame: 30, xp: 400 },
        /** Dream clubs offered: the world's most famous clubs. */
        dreamClubs: 10,
      },
      hallOfFame: {
        appearance: 0.5,
        goal: 2,
        assist: 1,
        cap: 1,
        trophy: 15,
        /** A season honour's worth; other kinds are weighed against it. */
        award: 10,
        /** By kind: routine awards are worth less than season honours. */
        awardWeights: {
          /** Shown in the live ranking before record 1; the record itself leaves months out. */
          month: 2,
          'team-season': 3,
          'young-player': 10,
          'golden-boot': 10,
          mvp: 10,
        },
        goldenBall: 40,
        /**
         * Achievement record 1 (`career/honours/achievements.ts`): the same rules for every
         * player. A season's club contribution is `appearance × apps + goals, assists and clean
         * sheets by line`, weighted by the level it came at (`tiers`, tier 1 first; continental
         * cups at `continental`). Clean sheets credit the back line, so keepers and defenders can
         * match forwards. Trophies are weighted by level too; monthly awards do not count.
         */
        contribution: {
          goal: { GK: 2, DEF: 2, MID: 2, ATT: 2 },
          assist: { GK: 1.5, DEF: 1.5, MID: 1.5, ATT: 1 },
          cleanSheet: { GK: 2.75, DEF: 2.5, MID: 0.5, ATT: 0 },
        },
        tiers: [1, 0.75, 0.55, 0.4, 0.3, 0.25],
        continental: 1,
        domesticCup: 0.75,
        continentalTrophy: { 'continental:champions': 1.5, 'continental:shield': 0.9 } as Record<
          string,
          number
        >,
        /** Records from before the achievement record, whose level was never kept. */
        untrackedTier: 3,
      },
      child: { potential: 3, fameShare: 0.1, fameCap: 30, inheritance: 0.1 },
      /** Retired former teammates may become managers. */
      formerTeammateManager: 0.4,
      chronicleLimit: 600,
      /**
       * The most legacies a save holds. A career lasts at least 14 seasons (from 18 at the
       * latest to optional retirement at 32), so 50 take 700 seasons. Chronicle entries and
       * Moments are bounded per career, so a save holds at most this many careers' worth plus
       * the current one's.
       */
      legacyLimit: 50,
    },
  },
  gallery: { clubs: 15, players: 12, ages: [17, 28, 42] as const },
  workers: {
    transportBatchEntries: 32,
    transportYieldMs: 8,
    transportWideKeys: 64,
    transportNarrowKeys: 16,
    /**
     * Weekly checkpoints the world worker may run ahead of storage (release 1.0 step 3.3): it
     * waits before simulating further while this many are still being written. A crash loses
     * at most these weeks, never a committed one.
     */
    maxUncommittedWeeks: 2,
    /** Longest slice of the UI thread spent decoding a published world before yielding. */
    decodeSliceMs: 8,
    /** A world change smaller than this is sent to the world worker as patches. */
    maxSyncPatches: 20000,
  },
  /** Team selection (Phase 5.1): one formation-aware eleven for every match. */
  selection: {
    /** Worlds at this version pick formation-aware elevens; older worlds adopt it next season. */
    version: 1,
    /** A player's value in an unfamiliar position, as a share of their ability. */
    unfamiliarFactor: 0.8,
  },
  /**
   * How a player is summarised on screen (redesign phase 1). The overall rating is the rounded
   * position-weighted `playerAbility`; the six axes are plain means of the listed attributes,
   * with a separate set for goalkeepers. Presentation only: nothing in the simulation reads these.
   */
  ratings: {
    axes: {
      outfield: {
        pace: ['pace', 'acceleration'],
        shooting: ['finishing', 'longShots', 'composure'],
        passing: ['passing', 'vision', 'crossing'],
        dribbling: ['dribbling', 'firstTouch', 'agility'],
        defending: ['tackling', 'positioning', 'heading'],
        physical: ['stamina', 'strength', 'jumping'],
      },
      keeper: {
        diving: ['diving'],
        handling: ['handling'],
        kicking: ['kicking'],
        reflexes: ['reflexes'],
        oneOnOnes: ['oneOnOnes'],
        aerial: ['commandOfArea', 'aerialReach'],
      },
    },
    /** Familiarity words: at least `natural` is Natural, at least `accomplished` is Accomplished. */
    familiarity: { natural: 90, accomplished: 55 },
  },
  saves: {
    schemaVersion: 23,
    slotCount: 3,
    /**
     * The largest save a backup can hold, as uncompressed JSON (release 1.0 step 3.7): an import
     * refuses more, whether the file is plain or gzip, and an export refuses to write a backup
     * that could not be imported again.
     */
    maxFileBytes: 128 * 1024 * 1024,
    /** The largest gzip backup file read at all, before decompressing it. */
    maxCompressedFileBytes: 64 * 1024 * 1024,
    /** An export of more JSON than this succeeds with a warning that it nears the limit. */
    warnExportBytes: 100 * 1024 * 1024,
    autosaveDelayMs: 450,
    leaseDurationMs: 30000,
    heartbeatMs: 5000,
    /**
     * UI changes stored as patches beside the world (release 1.0 step 3.4) before the next
     * whole write: at most this many, of at most this many characters of JSON.
     */
    maxWorldPatches: 2000,
    maxPatchBytes: 512 * 1024,
    /**
     * Persistence watchdog (step 4.5, S9): a request without a reply in this long restarts the
     * persistence worker and fails with `storage`. Leases answer quickly; a load, import or
     * export of a 100 MB save on a slow phone can take a minute.
     */
    leaseTimeoutMs: 20000,
    requestTimeoutMs: 180000,
    /**
     * Storage preflight (step 4.6): a whole write needs this much more than its own bytes free,
     * by `navigator.storage.estimate()`, or it fails with `quota` before it starts.
     */
    quotaMarginBytes: 4 * 1024 * 1024,
    /**
     * Rotating backups inside IndexedDB (step 4.3), per slot: `season`, written after the first
     * whole write in a new season (or of another world), and `day`, taken after the first load
     * of a calendar day that passed every check. A third, `salvage`, keeps the stored records a
     * salvage load had to set parts aside from (step 4.4). Stored gzip-compressed where the
     * browser can. A backup is skipped (and the reason recorded) unless, after it, at least
     * `minFreeBytes` and `reserveWorlds` times the world's size stay free for the saves
     * themselves.
     */
    backups: {
      minFreeBytes: 64 * 1024 * 1024,
      reserveWorlds: 2,
    },
  },
  accessibility: {
    minFontScale: 0.85,
    maxFontScale: 1.3,
    /** Smallest CIELAB difference (CIE76) between shirt colours for every kind of vision. */
    kitClash: 22,
    /**
     * Smallest CIE76 difference between a team's colour and a surface it is drawn on (the pitch,
     * a card, the scoreboard) for every kind of vision; below it the colour gets an outline there,
     * or another colour of its kit on the pitch when it vanishes even with typical vision.
     */
    surfaceClash: 15,
  },
  world: {
    nationalWeeksPerSeason: 60,
    nationalCupWeeks: [5, 11, 17, 23, 29, 35, 41, 47, 53] as const,
    countries: 6,
    tiers: 4,
    clubsPerLeague: 8,
    squadSize: 22,
    startSeason: 2026,
    weeksPerSeason: 34,
    leagueRounds: 28,
    cupWeeks: [4, 10, 16, 22, 30] as const,
    movementPlaces: 2,
    baseGoals: 1.35,
    homeAdvantage: 0.14,
    strengthScale: 0.024,
    maxGoals: 10,
    /**
     * The AI transfer market (balance pass C): in each transfer week, a club with budget may
     * sign, for its weakest starting slot, the best affordable player who improves it by at
     * least `improvement`, from a smaller club (abroad with `abroadChance`); the seller asks a
     * multiple of market value by the player's role and sells at most `salesPerWindow`.
     */
    aiMarket: {
      signingChance: 0.4,
      improvement: 3,
      maximumAge: 31,
      abroadChance: 0.2,
      salesPerWindow: 2,
      minimumBudget: 20_000,
      reinvestShare: 0.5,
      askingFactor: { key: 1.4, rotation: 1.2, backup: 1, youth: 1.1 },
    },
    /** Legacy (34-week) worlds: AI transfer weeks and the academy intake week. */
    transferWeeks: [8, 18, 31] as const,
    intakeWeek: 31,
    /** National worlds derive them from the season length: transfer activity at these
     * fractions of the season (inside the summer and winter windows), the intake near the end. */
    lifecycleFractions: { transfer: [0.06, 0.13, 0.5, 0.55] as const, intake: 0.95 },
    /** Continental cups for national worlds (milestone 8). */
    continental: {
      /** Places per country in the Champions Cup and the Shield, from last season's table. */
      champions: { England: 6, Spain: 6, Italy: 6, Germany: 5, France: 5, Portugal: 4 },
      shield: { England: 5, Spain: 5, Italy: 5, Germany: 6, France: 6, Portugal: 5 },
      groupWeeks: [8, 12, 16, 20, 26, 30] as const,
      knockoutWeeks: [38, 44, 49, 55] as const,
      day: 2,
      /** Scouting visibility bonus for a player whose club plays in a continental cup. */
      visibility: 0.2,
      /** Prize money per match played, as a multiple of reputation²: the cups pay to play. */
      prize: { champions: 40, continental: 20 },
    },
    youthIntakePerClub: 2,
    /** Squad lifecycle: retirement, contracts, releases, free-agent signings and pruning. */
    lifecycle: {
      /** [age, probability] pairs; ages above the last entry use its probability. */
      retirementCurve: [
        [33, 0.06],
        [34, 0.12],
        [35, 0.24],
        [36, 0.4],
        [37, 0.55],
        [38, 0.7],
      ] as const,
      forcedRetirementAge: 41,
      squadTarget: 23,
      squadMaximum: 26,
      groupMinimum: { GK: 2, DEF: 7, MID: 5, ATT: 5 },
      /** Expiring contracts are renewed for players ranked inside this many by squad value. */
      renewalRank: 17,
      renewalYouthAge: 21,
      renewalMaximumAge: 35,
      youngAge: 23,
      veteranAge: 30,
      contractYears: { young: [2, 4], prime: [1, 3], veteran: [1, 2] } as const,
      potentialValueWeight: 0.5,
      agedValuePenalty: 1,
      /** Free agents sign for clubs whose top-eleven ability is at least theirs minus this. */
      signingAbilityMargin: 4,
      fillerAge: [19, 27] as const,
      freeAgentRetirementAge: 30,
      freeAgentSeasons: 2,
      readmissionRetirementAge: 37,
      /** Seasons of world events kept in the live graph (current plus previous). */
      eventSeasonsKept: 2,
    },
    /**
     * Retention (release plan step 3.6): what a long world keeps, applied at every season start
     * (`engine/world/retention.ts`) and once to older saves when they load. See BALANCING.md,
     * "Retention".
     */
    retention: {
      /**
       * Seasons whose summaries keep full tables, movements and play-offs; older seasons keep
       * their champions, division champions and cup winners. A season's full detail costs about
       * 240 KB of save; fifteen covers a whole career at the top and a generation of the World
       * archive for about 3.6 MB.
       */
      historySeasons: 15,
      /**
       * Archived players kept by Hall of Fame score beyond everyone the world still names. The
       * others leave the archive and only their scores stay (`WorldArchive.pruned`), so every
       * rank stays exact. About 370 bytes each: 1.9 MB at most.
       */
      archiveTop: 5000,
    },
    generation: {
      reputationCeiling: 99,
      reputationFloor: 87,
      reputationTierStep: 15,
      managerAge: [35, 68],
      managerAbility: [25, 95],
      personality: [15, 95],
      adultAge: [17, 36],
      /** Generated squads peak in age here (a triangular draw between the adult ages). */
      adultAgePeak: 25,
      veteranAge: [32, 37],
      youthAge: [16, 18],
      /** Peak overall ability (potential): reputation × weight + base ± talent. */
      peakReputationWeight: 0.75,
      peakBase: 13,
      talentSpread: 12,
      /** Clubs at or above each reputation draw talent as the best of that many draws. */
      talentSkew: [
        [84, 2],
        [90, 3],
      ] as const,
      /** Academy intake: reputation × weight + base ± spread, so big clubs also raise journeymen. */
      intake: { reputationWeight: 0.75, base: 13, spread: 12 },
      /** Foreign players: base + slope × how far the club sits between the two reputations. */
      foreignShare: { base: 0.05, slope: 0.6, from: 40, to: 90 },
      twoFootedChance: 0.05,
      youngAge: 20,
      secondaryFamiliarity: [35, 85],
      morale: [55, 85],
      form: [45, 75],
      contractYears: [1, 4],
      wageFloor: 50,
      /** Weekly wage: ability² × (wageBase + wageReputationWeight × (reputation/100)²), so the
       * club a player reaches matters: a tier-6 start ~50, a tier-1 regular ~1,700, a star
       * at a giant ~3,400, the same star at a tier-3 club under half of that. */
      wageBase: 0.05,
      wageReputationWeight: 0.45,
      appearanceBonus: 0.1,
      goalBonus: 0.15,
      cleanSheetBonus: 0.12,
      releaseWageMultiplier: 250,
      sellOnPercent: [0, 15],
      loyaltyWageMultiplier: 4,
      stadiumCapacityFactor: [8, 20],
      stadiumReputationDivisor: 4,
      pitchQuality: [45, 95],
      balanceFactor: 200,
      incomeFactor: 12,
      /** The smallest club still draws this much a week, so the lowest tiers stay solvent. */
      incomeFloor: 4800,
      costsFactor: 3,
      transferFactor: 60,
      wageBudgetFactor: 8,
      cultureRange: [20, 95],
      fanOwnedChance: 0.25,
      roomMood: 65,
    },
    background: {
      reputationWeight: 0.6,
      squadWeight: 0.4,
      minimumGoals: 0.15,
      penaltyWinnerChance: 0.5,
      /** The career player's shootout kick (or save) moves their side's chance by this. */
      shootoutKick: 0.15,
      penaltyLoserGoals: [2, 5],
      assistedGoalChance: 0.78,
      scorerWeights: { GK: 0.01, ST: 5, winger: 3, midfield: 1.5, defender: 0.5 },
      ratingBase: 6.1,
      ratingWin: 0.6,
      ratingLoss: -0.4,
      ratingGoal: 0.8,
      ratingVariation: 0.8,
      minimumRating: 3,
      maximumRating: 10,
      formRetention: 0.75,
      formRatingWeight: 0.25,
      moraleResultDelta: 2,
      matchFatigue: 12,
      weeklyRecovery: 14,
      fitnessFatigueWeight: 0.2,
      /**
       * Sackings: every week from `sackingFromWeek`, a manager whose points a game trail what
       * the club's standing in its league expects (from `expectedPointsRange` by reputation
       * rank) goes with probability hazard × shortfall; a new manager gets a grace period.
       */
      sacking: { fromWeek: 8, hazard: 0.012, cooldownWeeks: 15, expectedPointsRange: [0.8, 2.2] },
      /** Team strength adds (manager ability − 60) × this. */
      managerAbilityWeight: 0.05,
      /**
       * Reputation moves at each season's end: by the finish within the league (± rankStep
       * from top to bottom), plus a share of the distance back into the new tier's band when
       * outside it, within a maximum change; it stays within a margin of the band.
       * Continental winners gain.
       */
      reputation: {
        seasonStep: 0.5,
        rankStep: 1.5,
        maximumChange: 4,
        bandMargin: 5,
        championsWinner: 2,
        shieldWinner: 1,
      },
      /**
       * AI squads rotate: a tired player's value in selection falls from `fatigueFrom`, and a
       * fixture-seeded jitter of ± `jitter` (± `cupJitter` in domestic cups) lets near-equals
       * share the matches.
       */
      rotation: { fatigueFrom: 40, fatigueDivisor: 150, jitter: 6, cupJitter: 14 },
      /** AI players get injured too: chance per match × (0.5 + proneness/100) × (1 + fatigue/weight). */
      aiInjuries: { matchChance: 0.012, fatigueWeight: 50 },
      /**
       * Suspensions (the discipline phase; docs/BALANCING.md "Discipline and suspensions"). A
       * ban is served in the scope it was earned in: league football (league, phases and
       * playoffs), the domestic cup, or continental football. A second yellow bans for
       * `secondYellow` matches and a straight red for `straightRed`; every `accumulation`
       * yellows in a scope in a season (those that ended in a dismissal aside) ban for one.
       * Bans carry over a season's end; cards and tallies start again.
       */
      suspensions: {
        secondYellow: 1,
        straightRed: 3,
        accumulation: { league: 5, cup: 3, continental: 3 },
      },
      /** Background goals follow finishing (and assists passing and vision) around the team mean. */
      abilityScorerSlope: 1 / 25,
      abilityScorerFloor: 0.2,
      /** Background ratings add (ability − match mean) × this. */
      abilityRatingSlope: 0.02,
      transferContractYears: 2,
      transferBudgetBalanceShare: 0.35,
      /**
       * The club economy (review phase 4, step 4.4). The wage budget is what a club earns for
       * wages each week: income less running costs, less any debt spread over `reserveWeeks`
       * (savings are a cushion, not a budget). Wages above it are a loss (`stretched`). A debt
       * is floored at `debtFloorWeeks` of income.
       * Under strain a club stops buying, renews `renewalCut` fewer of its squad, offers the
       * career player `renewalWage` of a fair wage less often (`renewalChance`), and its
       * training support is worth `support`.
       */
      economy: {
        /**
         * The usual wages of a club's peers: the median wage bill of clubs within `peerWindow`
         * reputation points (widened to at least `peers` clubs). Running costs leave a club
         * paying that `wageShare` of its income for wages.
         */
        peerWindow: 2,
        peers: 15,
        wageShare: 0.85,
        /** The least a club keeps each week after running costs. */
        netFloor: 1300,
        reserveWeeks: 104,
        debtFloorWeeks: 52,
        renewalCut: { stretched: 3, debt: 6 },
        renewalWage: { stretched: 0.9, debt: 0.8 },
        renewalChance: { stretched: 0.75, debt: 0.5 },
        support: { stretched: 0.96, debt: 0.9 },
      },
    },
    /**
     * Ageing and development. Each attribute category follows an age curve (multiplier of a
     * player's peak value); AI players move toward their target, and generation places them
     * on the same curve so the world starts at equilibrium.
     */
    development: {
      /** [age, multiplier] points, linearly interpolated and clamped at the ends. */
      curves: {
        pace: [
          [16, 0.84],
          [18, 0.91],
          [21, 0.97],
          [23, 1],
          [26, 1],
          [28, 0.96],
          [30, 0.9],
          [32, 0.83],
          [35, 0.72],
          [40, 0.6],
        ],
        physical: [
          [16, 0.8],
          [18, 0.88],
          [21, 0.95],
          [24, 1],
          [28, 1],
          [30, 0.96],
          [32, 0.91],
          [34, 0.85],
          [37, 0.76],
          [40, 0.68],
        ],
        technical: [
          [16, 0.76],
          [18, 0.83],
          [21, 0.9],
          [24, 0.96],
          [26, 1],
          [30, 1],
          [32, 0.97],
          [34, 0.93],
          [37, 0.86],
          [40, 0.8],
        ],
        mental: [
          [16, 0.7],
          [18, 0.77],
          [21, 0.84],
          [24, 0.91],
          [27, 0.96],
          [30, 1],
          [34, 1],
          [37, 0.97],
          [40, 0.93],
        ],
        keeper: [
          [16, 0.72],
          [18, 0.8],
          [21, 0.87],
          [24, 0.93],
          [27, 0.98],
          [29, 1],
          [33, 1],
          [35, 0.95],
          [37, 0.89],
          [40, 0.8],
        ],
      },
      /** Age after which each category only declines toward its target (career player). */
      peakEnd: { pace: 26, physical: 28, technical: 30, mental: 34, keeper: 33 },
      /** Stable per-attribute deviation from a player's peak, derived from the player id. */
      profileSpread: 10,
      /** Peak emphasis on the attributes a position relies on. */
      positionalEmphasis: 8,
      /** Generated attributes sit within this many points of their age target. */
      generationNoise: 2,
      /** Fraction of the gap to target closed per season (growth scaled by professionalism). */
      growthPerSeason: 0.75,
      declinePerSeason: 0.75,
      professionalismBase: 0.6,
      /** Outfield players' goalkeeping attributes stay in this static band (and vice versa for keepers' outfield physical/technical). */
      untrainedRange: [1, 25],
    },
  },
} as const;
