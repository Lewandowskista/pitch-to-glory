import type { SkillBranch } from '../../model/domain';
import { cx } from '../../ui/kit/cx';

/** One stroked glyph per skill branch (24 × 24), for trait medals and the skill detail. */
const BRANCH_GLYPH: Record<SkillBranch, string> = {
  finishing: 'M4 18Q10 4 20 6M16 3L20 6L17 10',
  creativity: 'M12 3A6 6 0 0 1 16 13.5V16H8V13.5A6 6 0 0 1 12 3M9.5 19.5H14.5',
  dribbling: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M8 13Q12 8 16 13',
  defending: 'M12 3L19 6V12Q19 18 12 21Q5 18 5 12V6Z',
  physical: 'M13 2L5 13H11L10 22L19 10H13Z',
  mentality: 'M12 4A7 7 0 0 0 5 11Q5 14 7 16V20H14V17H16A2 2 0 0 0 18 15V12L20 11L18 8A7 7 0 0 0 12 4',
  'set-pieces': 'M5 20V4M5 5H17L14 9L17 13H5',
  goalkeeping:
    'M7 11V6A1.5 1.5 0 0 1 10 6V10M10 9V4.5A1.5 1.5 0 0 1 13 4.5V10M13 9V5.5A1.5 1.5 0 0 1 16 5.5V11M16 10V8A1.5 1.5 0 0 1 19 8V14Q19 20 13 21Q8 21 6 17L4 13A1.5 1.5 0 0 1 6.5 11.5L7 12',
};

export function SkillGlyph({ branch, className }: { branch: SkillBranch; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cx('h-5 w-5 shrink-0', className)}
    >
      <path
        d={BRANCH_GLYPH[branch]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
