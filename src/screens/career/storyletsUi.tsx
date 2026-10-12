import type { StoryState, World } from '../../model/domain';
import {
  answerStory,
  openStory,
  STORYLET_BY_KIND,
  type StoryEffects,
} from '../../engine/career/stories/storylets';
import { useAppStore } from '../../store';
import { format } from '../../i18n';
import { storyletsText as t } from '../../i18n/storylets';
import { storyChoice, storyScene, storyTitle } from './storyText';
import { ui, useEditBlock } from './shared';

/** Who a choice pleases and who it upsets, in words, without the exact numbers. */
function directions(effects: StoryEffects, params: StoryState['params']) {
  const entries: [string, number][] = [];
  for (const [key, value] of Object.entries(effects) as [keyof StoryEffects, unknown][]) {
    if (key === 'cliques')
      for (const [clique, delta] of Object.entries(value as Record<string, number>))
        entries.push([clique, delta]);
    else if (typeof value === 'number') entries.push([key, value]);
  }
  return entries
    .filter(([, delta]) => delta !== 0)
    .map(([key, delta]) => ({
      key,
      label: format(t.effects[key] ?? key, params),
      // More fatigue is bad news; less of it is good.
      good: key === 'fatigue' ? delta < 0 : delta > 0,
    }));
}

/**
 * This week's story on the hub: the scene and its choices, each with who it pleases and who
 * it upsets and whether it is settled at once or weeks later; or, once chosen, what is
 * still to be decided.
 */
export function StoryCard({ world }: { world: World }) {
  const block = useEditBlock();
  const story = openStory(world);
  if (!story) return null;
  const def = STORYLET_BY_KIND[story.kind];
  const params = story.params;
  const act = (choiceId: string) => {
    const current = useAppStore.getState().world;
    if (!current || block) return;
    useAppStore.getState().setWorld(answerStory(current, story.id, choiceId));
  };
  return (
    <section
      id="story"
      aria-labelledby="story-heading"
      className={`${ui.panel} flex flex-col gap-3 border-l-4 border-l-gold`}
      data-testid="story-card"
    >
      <p className={ui.eyebrow}>{t.card.eyebrow}</p>
      <h2 id="story-heading" className={ui.heading}>
        {storyTitle(story.kind)}
      </h2>
      <p className="max-w-prose">{storyScene(story.kind, params)}</p>
      {story.status === 'offered' ? (
        <>
          <ul className="grid gap-2">
            {def.choices.map((choice) => {
              const chips = directions(choice.effects, params);
              return (
                <li key={choice.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full flex-col items-start gap-1.5 rounded-control border border-line bg-surface-soft px-4 py-3 text-left hover:border-accent disabled:cursor-not-allowed"
                    disabled={Boolean(block)}
                    onClick={() => act(choice.id)}
                  >
                    <strong>{storyChoice(story.kind, choice.id, params)}</strong>
                    <span className="flex flex-wrap gap-1.5 text-xs">
                      {chips.map((chip) => (
                        <span
                          key={chip.key}
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            chip.good ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger'
                          }`}
                        >
                          {chip.good ? '▲' : '▼'} {chip.label}
                        </span>
                      ))}
                      {choice.followUp && (
                        <span className="rounded-full bg-surface px-2 py-0.5 font-semibold text-muted">
                          {choice.followUp === 1
                            ? t.card.followUpOne
                            : format(t.card.followUp, { weeks: choice.followUp })}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">
            {format(t.card.respond, {
              week: story.respondBy.week,
              lapse: storyChoice(story.kind, def.lapse, params),
            })}
          </p>
          {block && <p className="text-xs text-muted">{block}</p>}
        </>
      ) : (
        <p className="text-sm text-muted">
          {format(t.card.waiting, {
            choice: storyChoice(story.kind, story.choice!, params),
            week: story.resolveAt?.week ?? story.respondBy.week,
          })}
        </p>
      )}
    </section>
  );
}
