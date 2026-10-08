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
    /** A manager may also replace a poor or well-protected player at these minutes. */
    tacticalSubstitution: { minutes: [60, 70, 80], chance: 0.08, ratingBelow: 6, leadingBy: 2 },
    /** Background shot → goal conversion, and created-chance goal probability per recorded shot. */
    shotConversion: 0.12,
    chanceConversion: 0.3,
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
      talk: { motivate: 1.03, complain: 0.97, momentum: 8, leaderBonus: 1.5 },
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
      technical: { clear: 0, rain: -0.06, wind: 0, snow: -0.1 },
      direct: { clear: 0, rain: -0.02, wind: -0.08, snow: -0.05 },
      pitchGood: 70,
      pitchSlope: 0.004,
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
    momentum: { decay: 0.85, shot: 4, goal: 12, success: 3, failure: 2, minimum: 5, maximum: 95 },
    possession: { strengthSlope: 0.45, mentality: 3, momentum: 0.08, minimum: 30, maximum: 70 },
    commentaryVariants: 3,
    /** Simulated career matches pick among choices within this many expected goals of the best. */
    autoPlayMargin: 0.02,
    xp: {
      perMinute: 0.5,
      ratingThreshold: 5.5,
      perRating: 50,
      perGoal: 40,
      perAssist: 28,
      perObjective: 15,
    },
    fame: { ratingThreshold: 6.3, perRating: 3, perGoal: 1.5, perAssist: 1, perCleanSheet: 1.5 },
    /** Personal objectives: a rating target and one drawn for the position each match. */
    objectives: {
      rating: 7,
      /** Passing target: the player's routine completion plus a margin, within the range. */
      passingMargin: -3,
      passingRange: [65, 90] as const,
      tackles: { defender: 3, midfield: 2 },
      saves: 5,
      shots: { striker: 4, other: 2 },
    },
  },
  /** Career player progression (milestone 4). See docs/BALANCING.md. */
  career: {
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
      /** Matches counted for recent playing time. */
      recentMatches: 8,
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
      /** Successes this far below what the decisions' chances predicted count as a pattern. */
      shortfall: 1.5,
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
      fatigue: { low: 0.5, normal: 1.5, high: 4, extra: 2, recovery: -8 },
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
    /** Contracts, agents, transfers and loans (milestone 5). See docs/BALANCING.md. */
    market: {
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
      },
      media: {
        limit: 150,
        pressWeeks: 2,
        /** Weeks before the press asks about the same topic again. */
        topicCooldown: 6,
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
    /** Fame, sponsorships, lifestyle, wardrobe, celebrations and challenges (milestone 7). */
    lifestyle: {
      /** Fame needed for levels 1–10. */
      fameLevels: [0, 20, 50, 100, 170, 260, 380, 530, 720, 950] as const,
      /** At each new season fame above the floor fades by this share: fame is a standing. */
      fameDecay: { above: 100, share: 0.1 },
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
      },
      awards: {
        monthWeeks: 5,
        monthMinimumApps: 2,
        seasonMinimumApps: 10,
        youngAge: 21,
        /** Score: average rating × rating + goals × goal + assists × assist, times the league
         * tier's visibility for Young Player and the Golden Ball. */
        score: { rating: 10, goal: 1.5, assist: 1, monthGoal: 0.6, monthAssist: 0.4 },
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
         * The most a save may hold: careers' awards are never dropped, so generations add to
         * the record limit.
         */
        maxRecords: 2000,
        fame: { month: 3, season: 6, goldenBall: 25, shortlist: 5 },
      },
      /** Retirement is forced at the age, or from declineAge once ability falls below this
       * share of its peak. */
      retirement: { optionalAge: 32, forcedAge: 38, declineAge: 33, declineShare: 0.78 },
      moments: { limit: 40, lateMinute: 85, wonderProbability: 0.2 },
      /** Hall of Fame score. */
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
          month: 2,
          'team-season': 3,
          'young-player': 10,
          'golden-boot': 10,
          mvp: 10,
        },
        goldenBall: 40,
      },
      child: { potential: 3, fameShare: 0.1, fameCap: 30, inheritance: 0.1 },
      /** Retired former teammates may become managers. */
      formerTeammateManager: 0.4,
      chronicleLimit: 600,
    },
  },
  gallery: { clubs: 15, players: 8, ages: [17, 28, 42] as const },
  workers: { transportBatchEntries: 32, transportYieldMs: 8 },
  /** Team selection (Phase 5.1): one formation-aware eleven for every match. */
  selection: {
    /** Worlds at this version pick formation-aware elevens; older worlds adopt it next season. */
    version: 1,
    /** A player's value in an unfamiliar position, as a share of their ability. */
    unfamiliarFactor: 0.8,
  },
  saves: {
    schemaVersion: 18,
    slotCount: 3,
    maxFileBytes: 128 * 1024 * 1024,
    autosaveDelayMs: 450,
    leaseDurationMs: 30000,
    heartbeatMs: 5000,
  },
  accessibility: {
    minFontScale: 0.85,
    maxFontScale: 1.3,
    /** Smallest CIELAB difference (CIE76) between shirt colours for every kind of vision. */
    kitClash: 22,
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
      /** Background goals follow finishing (and assists passing and vision) around the team mean. */
      abilityScorerSlope: 1 / 25,
      abilityScorerFloor: 0.2,
      /** Background ratings add (ability − match mean) × this. */
      abilityRatingSlope: 0.02,
      transferContractYears: 2,
      transferBudgetBalanceShare: 0.35,
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
