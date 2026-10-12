import type { StoryKind } from '../../../model/domain';

/**
 * Each story's choices by id, for save validation without loading the story engine. Kept in
 * step with `STORYLETS` (a test checks they agree).
 */
export const STORY_CHOICES: Readonly<Record<StoryKind, readonly string[]>> = {
  'senior-dispute': ['back', 'neutral', 'manager'],
  'mentor-youth': ['mentor', 'decline'],
  captaincy: ['stand', 'support'],
  'new-manager': ['extra', 'quiet', 'talk'],
  'rival-war': ['respond', 'ignore', 'joke'],
  'transfer-saga': ['commit', 'quiet', 'flirt'],
  comeback: ['ease', 'prove'],
  homecoming: ['applaud', 'cool', 'nofriends'],
  charity: ['visit', 'donate', 'decline'],
  'night-out': ['go', 'stay'],
  'derby-promise': ['promise', 'respect'],
  'contract-envy': ['talks', 'let', 'joke'],
};
