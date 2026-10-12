import type { StoryKind } from '../../model/domain';
import { format } from '../../i18n';
import { storyletsText as t } from '../../i18n/storylets';

type Params = Record<string, string | number>;
const story = (kind: string) => t.stories[kind];
/** A story's title, e.g. "Derby week". */
export function storyTitle(kind: StoryKind | string): string {
  return story(kind)?.title ?? kind;
}
/** The story's scene, with its names filled in. */
export function storyScene(kind: StoryKind | string, params: Params): string {
  return format(story(kind)?.body ?? '', params);
}
export function storyChoice(kind: StoryKind | string, choice: string, params: Params): string {
  return format(story(kind)?.choices[choice] ?? choice, params);
}
/** How the story ended: an outcome, or the choice that settled it at once. */
export function storyEnding(kind: StoryKind | string, outcome: string, params: Params): string {
  return format(story(kind)?.outcomes[outcome] ?? '', params);
}
/** Inbox copy for a story message (its params carry `story` and, once settled, `outcome`). */
export function storyMessageParams(params: Params): Params {
  const kind = String(params.story);
  return {
    ...params,
    title: storyTitle(kind),
    scene: storyScene(kind, params),
    ending: params.outcome ? storyEnding(kind, String(params.outcome), params) : '',
  };
}
