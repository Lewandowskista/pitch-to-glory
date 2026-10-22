import type { MediaTone, World } from '../../../model/domain';
import { draftWorld } from '../market/actions';
import { answerPress } from './media';
import { careerRoom } from './rules';

export type SocialAction =
  | { type: 'answer'; mediaId: string; choiceId: string }
  /** Routine press answered in this tone as it arrives, or by the player (null). */
  | { type: 'press-tone'; tone: MediaTone | null };

/**
 * The player's social decisions from the UI. Like market actions, the result shares every
 * record it does not change; answering touches the career, relationships, the career
 * club's dressing room, the media and the rivalry.
 */
export function applySocialAction(input: World, action: SocialAction): World {
  if (!input.career) throw new Error('No career in this world');
  const world = draftWorld(input, { dressingRooms: [careerRoom(input).id] });
  if (action.type === 'press-tone') {
    const social = world.career!.social;
    if (action.tone) social.pressTone = action.tone;
    else delete social.pressTone;
    return world;
  }
  answerPress(world, action.mediaId, action.choiceId);
  return world;
}
