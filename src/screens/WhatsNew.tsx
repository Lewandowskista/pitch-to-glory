import { format } from '../i18n';
import {
  PATCH_NOTES,
  RELEASE_SECTIONS,
  type ReleaseNotes,
  type ReleaseSection,
} from '../i18n/patchNotes';
import { whatsNewText as w } from '../i18n/whatsNew';
import { APP_VERSION } from '../release/version';
import { Page } from '../ui/Page';
import { Icon, type IconName } from '../ui/Icon';
import { CardTitle, Chip, Disclosure, PageHeader, Panel, cx } from '../ui/kit';

const dates = new Intl.DateTimeFormat(w.dateLocale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const releaseDate = (iso: string) => dates.format(new Date(`${iso}T00:00:00Z`));
const meta = (release: ReleaseNotes) =>
  format(w.meta, {
    version: format(w.version, { version: release.version }),
    date: releaseDate(release.date),
  });

/** Each section's mark, so the groups read apart without relying on colour. */
const SECTION_MARK: Record<ReleaseSection, { icon: IconName; tone: string }> = {
  new: { icon: 'life', tone: 'bg-art-gold text-gold-ink' },
  improved: { icon: 'arrow', tone: 'bg-accent-soft text-accent' },
  fixed: { icon: 'check', tone: 'bg-art-blue text-info' },
};

function Section({
  release,
  section,
  id,
}: {
  release: ReleaseNotes;
  section: ReleaseSection;
  id: string;
}) {
  const { icon, tone } = SECTION_MARK[section];
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h3 id={id} className="flex items-center gap-2.5 text-[0.9375rem] font-extrabold text-ink">
        <span
          aria-hidden="true"
          className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-control', tone)}
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>
        {w.sections[section]}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {release[section]!.map((line) => (
          <li
            key={line}
            className="relative pl-[1.125rem] leading-relaxed before:absolute before:top-[0.6em] before:left-1 before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent"
          >
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The sections present in a release, in New, Improved, Fixed order. */
const sectionsOf = (release: ReleaseNotes) =>
  RELEASE_SECTIONS.filter((section) => release[section]?.length);

/** The newest release, open: on wide screens the longest group beside the others. */
function LatestRelease({ release }: { release: ReleaseNotes }) {
  const [first, ...rest] = sectionsOf(release);
  const id = (section: ReleaseSection) => `release-latest-${section}`;
  return (
    <Panel aria-labelledby="release-latest" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Chip tone="gold" icon="life">
            {w.latest}
          </Chip>
          <p className="text-[0.8125rem] font-semibold text-muted">{meta(release)}</p>
        </div>
        <CardTitle id="release-latest" size="lg">
          {release.title}
        </CardTitle>
        <p className="max-w-[44rem] text-muted sm:text-[0.9375rem]">{release.summary}</p>
      </div>
      {first && (
        <div
          className={cx(
            'grid items-start gap-6 border-t border-line pt-5',
            rest.length > 0 && 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8',
          )}
        >
          <Section release={release} section={first} id={id(first)} />
          {rest.length > 0 && (
            <div className="flex min-w-0 flex-col gap-6">
              {rest.map((section) => (
                <Section key={section} release={release} section={section} id={id(section)} />
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Older releases, each behind a disclosure. */
function EarlierReleases({ releases }: { releases: readonly ReleaseNotes[] }) {
  return (
    <Panel aria-labelledby="release-earlier" className="flex flex-col gap-4">
      <div>
        <CardTitle id="release-earlier">{w.earlier}</CardTitle>
        <p className="mt-1 text-muted">{w.earlierBody}</p>
      </div>
      <div className="flex flex-col gap-3">
        {releases.map((release) => {
          const key = `release-${release.version.replaceAll('.', '-')}`;
          return (
            <Disclosure
              key={release.version}
              summary={`${release.version} · ${release.title}`}
              hint={releaseDate(release.date)}
            >
              <div className="flex flex-col gap-5 pt-1 text-sm">
                <p className="max-w-[44rem] text-muted">{release.summary}</p>
                {sectionsOf(release).map((section) => (
                  <Section
                    key={section}
                    release={release}
                    section={section}
                    id={`${key}-${section}`}
                  />
                ))}
              </div>
            </Disclosure>
          );
        })}
      </div>
    </Panel>
  );
}

export default function WhatsNew() {
  const [latest, ...earlier] = PATCH_NOTES;
  return (
    <Page>
      <PageHeader
        eyebrow={format(w.installed, { version: APP_VERSION })}
        title={w.title}
        description={w.description}
      />
      <div className="flex max-w-[77.5rem] flex-col gap-5">
        {latest && <LatestRelease release={latest} />}
        {earlier.length > 0 && <EarlierReleases releases={earlier} />}
      </div>
    </Page>
  );
}
