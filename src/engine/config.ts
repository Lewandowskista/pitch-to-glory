/** Identifies the build that last wrote a save. Informational; compatibility uses schema and rule versions. */
export const ENGINE_VERSION = 'ptg-hardening-1';
export const CONFIG = {
  match: {
    /** Opportunity count: clamp(momentBase + involvement + round((form − 50) / formStep) ± 1). */
    minimumMoments: 6,
    maximumMoments: 15,
    momentBase: 8,
    involvement: { attack: 1, other: 0, keeper: -1 },
    formStep: 15,
    fatiguePerMinute: 0.48,
    highRiskFatigue: 0.08,
    halftimeRecovery: 8,
    substitutionFatigue: 82,
    minimumSubstitutionMinute: 65,
    /** No new substitution is triggered from this minute onwards. */
    substitutionCutoffMinute: 90,
    /** Background shot → goal conversion, and created-chance goal probability per recorded shot. */
    shotConversion: 0.12,
    chanceConversion: 0.3,
    passPerMinute: 0.48,
    routinePass: { base: 0.68, passing: 0.002, fatigue: 0.0008, minimum: 0.4, maximum: 0.96 },
    /** Personal tactics adjust strength-model expectations: mentality moves goal share, risk total. */
    tactics: {
      mentalityShare: 0.03,
      riskTotal: { low: 0.95, balanced: 1, high: 1.06 },
      minimumShare: 0.1,
      maximumShare: 0.9,
    },
    /** Fraction of own [attack] and opposition [defence] expected goals replaced by key moments. */
    shares: {
      ST: [0.55, 0.04],
      LW: [0.42, 0.05],
      RW: [0.42, 0.05],
      AM: [0.4, 0.05],
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
      /** All choices in a fixture of importance above 1, with the Big Game Player skill. */
      bigGameMultiplier: 1.1,
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
      stop: 1.5,
      /** Every goal conceded from the player's own key moment. */
      error: -0.45,
      minimum: 3,
      maximum: 10,
    },
    momentum: { decay: 0.85, shot: 4, goal: 12, success: 3, failure: 2, minimum: 5, maximum: 95 },
    possession: { strengthSlope: 0.45, mentality: 3, momentum: 0.08, minimum: 30, maximum: 70 },
    commentaryVariants: 3,
    xp: {
      perMinute: 1.2,
      ratingThreshold: 6,
      perRating: 25,
      perGoal: 30,
      perAssist: 20,
      perObjective: 15,
    },
    fame: { ratingThreshold: 6.5, perRating: 2, perGoal: 2 },
  },
  /** Career player progression (milestone 4). See docs/BALANCING.md. */
  career: {
    /** XP needed from level n to n + 1 is levelXpBase × levelXpGrowth^(n − 1). */
    levelXpBase: 300,
    levelXpGrowth: 1.06,
    maximumLevel: 99,
    attributePointsPerLevel: 8,
    skillPointsPerLevel: 1,
    /** Fixture importance multiplies match XP and powers big-game skills. */
    importance: { league: 1, phase: 1.1, cup: 1.15, tie: 1.25, final: 1.5 },
    /** XP multiplier from opposition reputation relative to the player's club. */
    oppositionSlope: 0.01,
    oppositionRange: [0.8, 1.3] as const,
    /** Attribute point costs relative to the age-adjusted soft cap. */
    costs: {
      belowCap: 1,
      nearCap: 2,
      beyondCap: 3,
      capMargin: 5,
      physicalAge: 29,
      physicalSurcharge: 1,
    },
    start: {
      ageRange: [16, 18] as const,
      potential: [74, 88] as const,
      /** Starting attributes sit this far below the trial club's squad average... */
      belowClub: 3,
      /** ...plus the archetype's emphasis, scaled by this factor. */
      emphasisScale: 1,
      noise: 2,
      offers: 3,
    },
    training: {
      sessions: 3,
      gain: { low: 0.08, normal: 0.13, high: 0.19 },
      mentorGain: 0.15,
      /** Mentor quality multiplies gain by up to 1 + this, from the mentor's lead in the focus. */
      mentorBonus: 0.5,
      fatigue: { low: 1, normal: 2, high: 5, extra: 3, recovery: -12 },
      injuryRisk: { low: 0.002, normal: 0.005, high: 0.013, extra: 0.004 },
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
      /** Training progress above the soft cap is slowed by this factor and stops at cap + margin. */
      beyondCapFactor: 0.5,
      professionalSkill: 1.2,
      secondWindSkill: 0.7,
    },
    injuries: {
      matchChance: 0.008,
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
      rush: { durationFactor: 0.6, reinjuryRisk: 0.15 },
      /** A career-threatening injury permanently costs this much pace and acceleration. */
      threateningLoss: 6,
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
      bidConfidenceWeight: 0.005,
      /** Lines a squad fields, for the role a player can be promised. */
      slots: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
      /** Selection: chance of starting by role, then adjustments. */
      selection: {
        base: { key: 0.97, rotation: 0.85, backup: 0.45, youth: 0.6 },
        inTeam: 0.08,
        perPlaceOutside: 0.05,
        maximumPlacesOutside: 4,
        form: 0.003,
        trust: 0.002,
        tiredFatigue: 70,
        tired: 0.15,
        minimum: 0.05,
        keyFloor: 0.9,
        /** Share of matchdays a promise guarantees; below it the promise is broken. */
        promise: { key: 0.7, rotation: 0.4 },
        promiseMinimumMatchdays: 10,
      },
      /** Interest and scouting. */
      scouting: {
        /** Visibility by the player's division tier (index 0 = tier 1). */
        visibility: [1, 0.85, 0.7, 0.55, 0.45, 0.4] as const,
        foreign: 0.35,
        startChance: 0.04,
        maximumTransfer: 10,
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
        offerChance: 0.4,
        maximumOpenOffers: 2,
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
        agentStretch: 0.0025,
        desireStretch: 0.0025,
        openingWage: 0.95,
        walkAwayWage: 1.3,
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
        pitchChance: 0.0025,
        connectedPitch: 2,
        adviceWeeks: 8,
        underpaid: 1.3,
      },
      /** Standing for agents: ability, club reputation and fame. */
      standing: { ability: 0.55, reputation: 0.45, fameDivisor: 25, fameCap: 15 },
      bonusDefenders: ['GK', 'CB', 'LB', 'RB'] as const,
      sellOnAge: 23,
      sellOnPercent: 10,
      inboxLimit: 200,
      /** Every interest from bigger clubs also counts for the buyer's reputation step. */
      upwardStep: 5,
    },
    /** Morale, relationships, dressing room, rival and media (milestone 6). See BALANCING.md. */
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
      matchMorale: { neutral: 70, slope: 0.002, minimum: 0.92, maximum: 1.08 },
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
        failedFame: -3,
        bootsBreachFame: -2,
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
      /** Upkeep above this share of the weekly wage weighs on morale. */
      overspendShare: 0.5,
      overspendMorale: -3,
      resale: 0.6,
      /** Weekly investment returns: mean ± spread. */
      investments: {
        bond: { mean: 0.001, spread: 0 },
        fund: { mean: 0.0025, spread: 0.004 },
        startup: { mean: 0.004, spread: 0.03 },
      },
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
        /** Selection score: ability + form × form + min(fameCap, fame × fame). */
        selection: { form: 0.1, fame: 0.02, fameCap: 8 },
        starterSlots: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
        benchChance: 0.4,
        baseGoals: 1.3,
        strengthScale: 0.035,
        goalShare: { GK: 0, DEF: 0.04, MID: 0.12, ATT: 0.28 },
        assistShare: { GK: 0, DEF: 0.05, MID: 0.14, ATT: 0.12 },
        youthRating: 10,
        fame: { cap: 1, goal: 2, tournament: 10 },
        xp: { cap: 25, goal: 15 },
        matchLimit: 120,
        tournamentLimit: 30,
      },
      awards: {
        monthWeeks: 5,
        monthMinimumApps: 2,
        seasonMinimumApps: 10,
        youngAge: 21,
        /** Score: average rating × rating + goals × goal + assists × assist. */
        score: { rating: 10, goal: 1.5, assist: 1, monthGoal: 0.6, monthAssist: 0.4 },
        /** Golden Ball bonuses for team success. */
        champion: 10,
        topFour: 5,
        continentalWinner: 10,
        continentalFinal: 5,
        tournamentWinner: 8,
        shortlist: 10,
        fame: { month: 3, season: 6, goldenBall: 25, shortlist: 5 },
      },
      retirement: { optionalAge: 32, forcedAge: 40 },
      moments: { limit: 40, lateMinute: 85, wonderProbability: 0.2 },
      /** Hall of Fame score. */
      hallOfFame: {
        appearance: 0.5,
        goal: 2,
        assist: 1,
        cap: 1,
        trophy: 15,
        award: 10,
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
  saves: {
    schemaVersion: 12,
    slotCount: 3,
    maxFileBytes: 128 * 1024 * 1024,
    autosaveDelayMs: 450,
    leaseDurationMs: 30000,
    heartbeatMs: 5000,
  },
  accessibility: { minFontScale: 0.85, maxFontScale: 1.3 },
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
    strengthScale: 0.012,
    maxGoals: 10,
    transferWeeks: [8, 18, 31] as const,
    managerWeeks: [12, 24] as const,
    intakeWeek: 31,
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
      veteranAge: [32, 37],
      youthAge: [16, 18],
      /** Peak overall ability (potential): reputation × weight + base ± talent. */
      peakReputationWeight: 0.75,
      peakBase: 13,
      talentSpread: 8,
      youngAge: 20,
      secondaryFamiliarity: [35, 85],
      morale: [55, 85],
      form: [45, 75],
      contractYears: [1, 4],
      wageFloor: 50,
      wageBase: 0.12,
      wageReputationDivisor: 1000,
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
      formRetention: 0.85,
      formRatingWeight: 0.15,
      moraleResultDelta: 2,
      matchFatigue: 12,
      weeklyRecovery: 10,
      fitnessFatigueWeight: 0.2,
      managerPointsThreshold: 0.9,
      managerDismissalChance: 0.8,
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
