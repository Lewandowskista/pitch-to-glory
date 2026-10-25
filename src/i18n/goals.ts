import { LOCALE, type Translations } from './locale';

/**
 * Goal moments in the live match (release 1.0, step 5.1): the GOAL banner and the score-aware
 * commentary line that names the team. Parameters: {scorer}, {team} (the club credited with
 * the goal), {opponent}, {minute} and {scoreline} ("Vale 2–1 Ashby").
 */
const goalCopyEn = {
  goal: 'Goal!',
  ownGoal: 'Own goal!',
  /** The banner's line under the title: who scored, and when. */
  scorer: '{scorer} · {minute}′',
  yourGoal: 'Your goal',
  replay: 'Replay',
  replayHint: 'Replay the goal (R)',
  replaying: 'Replay',
  /** Spoken when the banner appears. */
  announce: 'Goal for {team}. {scoreline}.',
  lines: {
    /** A goal at the scorer's own ground: an opener, a second, or one pulled back. */
    home: [
      'GOAL! {scorer} scores for {team}, and the home end erupts. {scoreline}.',
      '{scorer} finds the net and the ground is rocking for {team}. {scoreline}.',
      'In it goes! {scorer} scores for {team} in front of their own fans. {scoreline}.',
      '{team} score! {scorer} with the finish, and the home crowd roar. {scoreline}.',
      'Goal for {team}: {scorer} buries it and the stands are bouncing. {scoreline}.',
      '{scorer} scores! The home supporters salute a goal for {team}. {scoreline}.',
    ],
    /** A goal for the visitors. */
    away: [
      'GOAL! {scorer} scores for {team}, and the away end goes wild. {scoreline}.',
      '{scorer} silences the home crowd. A goal for {team}: {scoreline}.',
      '{team} score on the road! {scorer} with the finish. {scoreline}.',
      'In it goes for the visitors: {scorer} scores for {team}. {scoreline}.',
      'The travelling fans are on their feet: {scorer} scores for {team}. {scoreline}.',
      '{scorer} finds the net and the home crowd falls quiet. {team} score: {scoreline}.',
    ],
    /** A goal at a neutral ground. */
    neutral: [
      'GOAL! {scorer} scores for {team}. {scoreline}.',
      'In it goes! {scorer} with the finish for {team}. {scoreline}.',
      '{team} score, and {scorer} wheels away. {scoreline}.',
      '{scorer} finds the net, and the {team} supporters are on their feet. {scoreline}.',
      'Goal for {team}: {scorer} makes no mistake. {scoreline}.',
      '{scorer} scores for {team}, and half the stadium erupts. {scoreline}.',
    ],
    equaliser: [
      '{scorer} levels it for {team}! {scoreline}.',
      'All square! {scorer} equalises for {team}. {scoreline}.',
      '{team} are level, through {scorer}. {scoreline}.',
      'The equaliser! {scorer} brings {team} back into it. {scoreline}.',
    ],
    goAhead: [
      '{scorer} puts {team} ahead! {scoreline}.',
      '{team} take the lead through {scorer}. {scoreline}.',
      'Ahead! {scorer} scores, and {team} lead. {scoreline}.',
      '{scorer} edges {team} in front. {scoreline}.',
    ],
    lateEqualiser: [
      'Late drama! {scorer} snatches an equaliser for {team}. {scoreline}.',
      'At the death, {scorer} levels it for {team}! {scoreline}.',
      '{scorer} rescues {team} late on! {scoreline}.',
    ],
    lateGoAhead: [
      'A late goal! {scorer} puts {team} ahead with time almost up. {scoreline}.',
      'Late, late drama: {scorer} gives {team} the lead! {scoreline}.',
      '{team} hit the front late on, through {scorer}. {scoreline}.',
    ],
    ownGoal: [
      'Own goal! {scorer} turns the ball into the wrong net, and {team} score. {scoreline}.',
      'Disaster for {opponent}: an own goal from {scorer}. {scoreline}.',
      'It goes in off {scorer}: an own goal gifts {team} a goal. {scoreline}.',
    ],
  },
};
export const goalCopy = ({ en: goalCopyEn } satisfies Translations<typeof goalCopyEn>)[LOCALE];
