import type { World } from '../../../model/domain';
import { draftWorld } from '../market/actions';
import { answerPress } from './media';
import { careerRoom } from './rules';

export type SocialAction = { type: 'answer'; mediaId: string; choiceId: string };

/**
 * The player's social decisions from the UI. Like market actions, the result shares every
 * record it does not change; answering touches the career, relationships, the career
 * club's dressing room, the media and the rivalry.
 */
export function applySocialAction(input: World, action: SocialAction): World {
  if (!input.career) throw new Error('No career in this world');
  const world = draftWorld(input, { dressingRooms: [careerRoom(input).id] });
  answerPress(world, action.mediaId, action.choiceId);
  return world;
}
