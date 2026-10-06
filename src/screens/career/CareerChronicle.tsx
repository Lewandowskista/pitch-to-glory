import { honoursText as h } from '../../i18n/honours';
import { CareerPage } from './shared';
import { ChronicleView } from './ChronicleView';

export default function CareerChronicle() {
  return (
    <CareerPage eyebrow={h.eyebrow} title={h.titles.chronicle}>
      {({ world, career }) => <ChronicleView world={world} playerId={career.playerId} />}
    </CareerPage>
  );
}
