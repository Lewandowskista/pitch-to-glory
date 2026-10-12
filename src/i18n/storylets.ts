/**
 * Story arcs: each story's title, its scene, its choices and every way it can end.
 * Parameters: {teammate}, {manager}, {rival}, {club}, {city}, {weeks}, {goals}, {rivalGoals}.
 */
export const storyletsText = {
  card: {
    eyebrow: 'This week',
    respond: 'Decide by the end of week {week}. Unanswered: {lapse}',
    followUp: 'Settled in {weeks} weeks',
    followUpOne: 'Settled next week',
    waiting: 'You chose: {choice}. We will see how it plays out by week {week}.',
    who: 'Who it pleases',
    up: 'pleases',
    down: 'upsets',
    recent: 'Recent stories',
  },
  effects: {
    trust: 'Manager',
    fans: 'Fans',
    fame: 'Fame',
    mood: 'Dressing room',
    seniors: 'Senior players',
    young: 'Young players',
    core: 'The core',
    internationals: 'Internationals',
    teammate: '{teammate}',
    morale: 'Morale',
    form: 'Form',
    fatigue: 'Fatigue',
    xp: 'XP',
    cash: 'Money',
    rival: 'The rivalry',
    interest: '{club}’s interest',
    oldFans: '{club} fans',
  } as Record<string, string>,
  stories: {
    'senior-dispute': {
      title: 'Trouble in the dressing room',
      body: '{teammate} has fallen out with the manager over playing time and wants the squad’s backing. Everyone is watching what you do.',
      choices: {
        back: 'Back {teammate} publicly',
        neutral: 'Keep out of it',
        manager: 'Side with the manager',
      },
      outcomes: {
        neutral: 'You kept your head down. {teammate} noticed.',
        manager: 'The manager appreciated your loyalty. {teammate} has not forgotten.',
        reconciled: 'The manager and {teammate} made peace, and the squad came out of it closer.',
        frozen: 'The manager has not forgiven those who took sides. You feel the chill.',
      },
    },
    'mentor-youth': {
      title: 'A youngster looks up to you',
      body: '{teammate}, one of the club’s brightest prospects, asks if you will take them under your wing.',
      choices: {
        mentor: 'Take {teammate} under your wing',
        decline: 'Politely decline',
      },
      outcomes: {
        decline: 'You told {teammate} you need to focus on your own game.',
        grown:
          'Weeks of extra work paid off: {teammate} has come on leaps and bounds, and credits you.',
        gone: '{teammate} has moved on, but what you taught them stays with you.',
      },
    },
    captaincy: {
      title: 'The armband is up for grabs',
      body: 'The manager is choosing a new captain. You are in the conversation, and so is {teammate}.',
      choices: {
        stand: 'Put yourself forward',
        support: 'Back {teammate} for the job',
      },
      outcomes: {
        support: '{teammate} has the armband, with your backing.',
        named: 'You are the new club captain. The armband is yours.',
        passed: 'The manager chose {teammate}. Your time may yet come.',
      },
    },
    'new-manager': {
      title: 'A new manager arrives',
      body: '{manager} has taken charge and nobody’s place is safe. First impressions count.',
      choices: {
        extra: 'Stay behind for extra sessions',
        quiet: 'Let your football do the talking',
        talk: 'Ask for a one-to-one meeting',
      },
      outcomes: {
        quiet: 'You kept your head down and trained as normal.',
        impressed: '{manager} has noticed the extra work, and your form backs it up.',
        unconvinced: '{manager} saw the effort, but wants to see it on the pitch.',
        welcomed: '{manager} liked your ambition. You have their ear.',
        bristled: '{manager} did not appreciate being pressed so early.',
      },
    },
    'rival-war': {
      title: 'A war of words',
      body: '{rival} has had a dig at you in an interview. The press wants your reaction.',
      choices: {
        respond: 'Fire back: “Watch the goals column”',
        ignore: 'Rise above it',
        joke: 'Laugh it off on social media',
      },
      outcomes: {
        ignore: 'You said nothing. The story died quickly.',
        joke: 'The fans loved your reply. Even neutrals shared it.',
        won: 'You backed up your words, outscoring {rival} since. The press noticed.',
        lost: '{rival} had the last laugh. The goals column did not go your way.',
      },
    },
    'transfer-saga': {
      title: 'The rumours start',
      body: '{club} are said to be preparing a move for you. Your phone has not stopped ringing.',
      choices: {
        commit: 'Commit publicly to your club',
        quiet: 'Say nothing',
        flirt: 'Admit you are flattered',
      },
      outcomes: {
        commit: 'Your words calmed the fans, and {club} have cooled their interest.',
        quiet: 'You let the rumours run their course.',
        flirt: '{club} are encouraged; your own fans are not.',
      },
    },
    comeback: {
      title: 'Back from injury',
      body: 'After {weeks} weeks out, you are fit again. How hard do you push?',
      choices: {
        ease: 'Ease back in',
        prove: 'Prove the doubters wrong',
      },
      outcomes: {
        ease: 'You took it step by step and feel fresher for it.',
        roaring: 'A roaring return: your performances since have silenced the doubters.',
        slow: 'The comeback has been slower than you hoped.',
      },
    },
    homecoming: {
      title: 'Going back',
      body: 'Next week you face {club}, your old club. Their fans remember you.',
      choices: {
        applaud: 'Applaud the travelling fans',
        cool: 'Treat it like any other game',
        nofriends: '“No friends on the pitch”',
      },
      outcomes: {
        applaud: 'Your old fans gave you a warm welcome; a few of your own grumbled.',
        cool: 'You kept it professional.',
        nofriends: 'Your current fans loved it. The old ones will not forget it.',
      },
    },
    charity: {
      title: 'A good cause',
      body: 'A children’s hospital in {city} has asked if you would visit.',
      choices: {
        visit: 'Visit on your day off',
        donate: 'Send a donation instead',
        decline: 'Decline: you need the rest',
      },
      outcomes: {
        visit: 'The visit made the local news, and a lot of children very happy.',
        donate: 'Your donation was gratefully received.',
        decline: 'You stayed home and rested.',
      },
    },
    'night-out': {
      title: 'A night out',
      body: 'After the win, the lads at {club} are heading into town and want you along.',
      choices: {
        go: 'Join them',
        stay: 'Stay in and recover',
      },
      outcomes: {
        stay: 'An early night. The senior players approved.',
        bonded: 'A great night: the squad is tighter for it.',
        photos: 'Photos from the night ended up in the papers. The manager is not happy.',
      },
    },
    'derby-promise': {
      title: 'Derby week',
      body: 'It is the {city} derby against {club}. The fans want a promise.',
      choices: {
        promise: 'Promise them a win',
        respect: 'Respect the opposition',
      },
      outcomes: {
        respect: 'You kept your words measured.',
        delivered: 'You promised a win, and you delivered it. The city is yours this week.',
        broken: 'You promised a win and lost the derby. The fans have long memories.',
        drawn: 'A draw. Not the win you promised.',
      },
    },
    'contract-envy': {
      title: 'Pay day',
      body: '{teammate} let slip what they earn, a good deal more than you, and you have outplayed them all season.',
      choices: {
        talks: 'Ask the club for talks',
        let: 'Let it go',
        joke: 'Laugh it off with {teammate}',
      },
      outcomes: {
        let: 'You let it go, though it still rankles.',
        joke: 'You and {teammate} had a laugh about it.',
        heard: 'The club listened, and promised to look at your terms.',
        ignored: 'The club brushed you off. It stings.',
      },
    },
  } as Record<
    string,
    {
      title: string;
      body: string;
      choices: Record<string, string>;
      outcomes: Record<string, string>;
    }
  >,
  messages: {
    'story-offer': {
      subject: '{title}',
      body: '{scene} Decide on the hub.',
    },
    'story-outcome': {
      subject: '{title}: how it ended',
      body: '{ending}',
    },
  } as Record<string, { subject: string; body: string }>,
} as const;
