/**
 * Privacy copy (docs/ANALYTICS.md): the Settings card, the one-time invitation after the first
 * finished match and the privacy page. Kept out of the app shell; only these screens load it.
 */
export const privacyText = {
  settings: {
    title: 'Privacy',
    body: 'No ads and no account. Choose what the game may share to help make it better.',
    anonymous: 'Anonymous statistics',
    anonymousBody:
      'How matches play out, loading times and errors, sent without anything that identifies you or this device.',
    personal: 'Share how you play over time',
    personalBody:
      'Links your visits with a random code kept on this device, so we can see what keeps careers going. Turning this off deletes the code.',
    off: 'This copy of the game sends no statistics, so there is nothing to choose.',
    link: 'Read the privacy notice',
  },
  invitation: {
    title: 'Help shape the game',
    body: 'Share how you play over time? A random code on this device links your visits. No names, no saves, nothing that identifies you.',
    accept: 'Yes, share',
    decline: 'Not now',
    more: 'How it works',
    label: 'Invitation to share how you play',
  },
  page: {
    title: 'Privacy',
    description: 'What the game shares, what it never shares, and how to choose.',
    sections: [
      {
        id: 'summary',
        title: 'In short',
        paragraphs: [
          'Pitch to Glory has no ads and no account, and your saves stay on your device. To make the game better it sends a few anonymous statistics about how it plays. It only follows your play over time if you say yes.',
        ],
      },
      {
        id: 'anonymous',
        title: 'Anonymous statistics',
        paragraphs: [
          'On unless you turn them off. They cover how matches play out (the key moments, the choices made and whether they worked, ratings and results), how careers progress, how quickly screens, Continue and saving run, errors, and which screens are used.',
          'Each visit gets a new random code that lives only in memory until the page closes. Nothing is stored on your device to recognise you, so two visits cannot be linked.',
        ],
      },
      {
        id: 'personal',
        title: 'Sharing how you play over time',
        paragraphs: [
          'Only if you agree, in the invitation after your first match or in Settings. A random code is then kept on this device and sent with the same statistics, so we can see whether players come back and how long careers last.',
          'The code is made up at random and says nothing about you. Turning sharing off deletes it, and agreeing again creates a new one.',
        ],
      },
      {
        id: 'never',
        title: 'What is never sent',
        paragraphs: [
          'Names you type (your player, clubs or anything in edit mode), your saves or their contents, world seeds, anything you write, file names, and anything else that could identify you. Players, clubs and countries appear only as internal codes, and amounts such as wages appear only in broad bands.',
          'There are no cookies, no advertising identifiers and no tracking across other sites.',
        ],
      },
      {
        id: 'processor',
        title: 'Who receives it',
        paragraphs: [
          'The statistics are processed for us by PostHog on servers in the European Union. They are used only to balance and improve the game, and never sold or shared for advertising.',
          'Like any request on the web, the connection carries your IP address; PostHog is set to discard it rather than store it with the statistics.',
        ],
      },
      {
        id: 'choose',
        title: 'How to choose',
        paragraphs: [
          'Open Settings and use the switches in the Privacy card. Turning off anonymous statistics stops everything, including sharing over time. Your choices are kept on this device only; clearing the site’s data resets them.',
        ],
      },
    ],
    settings: 'Open Settings',
  },
} as const;
