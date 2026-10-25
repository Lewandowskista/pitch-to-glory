import { privacyText as p } from '../i18n/privacy';
import { Page } from '../ui/Page';
import { ButtonLink, CardTitle, PageHeader, Panel } from '../ui/kit';

/** The privacy notice (docs/ANALYTICS.md): both kinds of sharing, in plain words. */
export default function Privacy() {
  return (
    <Page>
      <PageHeader title={p.page.title} description={p.page.description} />
      <div className="flex max-w-[52rem] flex-col gap-5">
        {p.page.sections.map((section) => (
          <Panel
            key={section.id}
            aria-labelledby={`privacy-${section.id}`}
            className="flex flex-col gap-3"
          >
            <CardTitle id={`privacy-${section.id}`}>{section.title}</CardTitle>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="m-0 leading-relaxed text-muted">
                {paragraph}
              </p>
            ))}
          </Panel>
        ))}
        <ButtonLink to="/settings" variant="secondary" icon="settings" className="self-start">
          {p.page.settings}
        </ButtonLink>
      </div>
    </Page>
  );
}
