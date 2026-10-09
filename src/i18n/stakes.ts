/** What a career fixture is about: one line on the hub and before kickoff. */
export const stakesText = {
  label: 'What is at stake',
  kinds: {
    final: 'A final. Win it and there is silverware.',
    tie: 'Knockout football. Lose and you are out.',
    phase: 'Playoff football. Every point decides who goes up or down.',
    rival: 'Your rival {rival} lines up for {opponent}.',
    'former-club': 'A return to {opponent}, your old club.',
    derby: 'A {city} derby. Bragging rights are on the line.',
    'go-top': 'Win and you go top of the table.',
    'stay-top': 'Top of the table. Win and you stay there.',
    'top-clash': 'Top-of-the-table clash: {opponent} are {rank} in the table.',
    'into-promotion': 'Win and you climb into the promotion places.',
    'escape-drop': 'Win and you climb out of the relegation zone.',
    'six-pointer': 'A relegation six-pointer against {opponent}.',
    cup: 'Cup football against {opponent}. Anything can happen.',
  },
  rank: ['1st', '2nd', '3rd'],
} as const;
