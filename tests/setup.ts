import 'fake-indexeddb/auto';
import { addMatchLabels } from '../src/i18n/match';
import { momentCopy } from '../src/i18n/momentsCopy';

// The match copy the match screen loads with its commentary (step 5.2: match-22's framings and
// reads, screens/match/lines.ts), so engine tests can check every key has words.
addMatchLabels(momentCopy);
