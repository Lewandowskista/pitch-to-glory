import { Component, Suspense, type ReactNode } from 'react';
import { recordFailure } from '../../diagnostics';
import { pitchCopy as copy } from '../../i18n/pitch';
import { lazyPage } from '../../ui/lazyPage';
import type { PitchProps } from './Pitch';

const Pitch = lazyPage(() => import('./Pitch'));
const PitchFallback = lazyPage(() => import('./PitchFallback'));

/** Draws `fallback` instead of whatever below it fails, recording the failure once. */
class Boundary extends Component<
  { children: ReactNode; fallback: ReactNode; record: boolean },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    if (this.props.record) recordFailure('boundary', error, 'pitch');
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The live pitch behind its own error boundary (release 1.0 step 4.2): when its code fails to
 * load (after one automatic retry) or it throws, the match carries on over the SVG pitch, and
 * over the commentary alone if even that cannot load. Suspends while loading, like the pitch.
 */
export function SafePitch(props: PitchProps) {
  return (
    <Boundary
      record
      fallback={
        <Suspense
          fallback={
            <p className="match-pitch-loading" role="status">
              {copy.fallback}
            </p>
          }
        >
          <Boundary
            record={false}
            fallback={
              <p className="match-pitch-loading" role="status">
                {copy.missing}
              </p>
            }
          >
            <PitchFallback {...props} />
          </Boundary>
        </Suspense>
      }
    >
      <Pitch {...props} />
    </Boundary>
  );
}
