import { LOCALE, type Translations } from './locale';
const trainingDraftTextEn = {
  pending: 'Training changes pending',
  advanceTitle: 'Save your training before continuing?',
  advanceBody:
    'Your edited training has not been saved. Save it before advancing time, or continue with the saved plan and discard these edits.',
  abandonTitle: 'Leave training changes behind?',
  abandonBody:
    'This action will replace or close your current session. Your pending training changes will be discarded. You can keep editing instead.',
  saveContinue: 'Save and continue',
  savedContinue: 'Continue with saved training',
  discardContinue: 'Discard changes and continue',
  keepEditing: 'Keep editing',
} as const;
export const trainingDraftText = (
  { en: trainingDraftTextEn } satisfies Translations<typeof trainingDraftTextEn>
)[LOCALE];
