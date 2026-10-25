import { pitchCopy as copy } from '../../i18n/pitch';
import type { PitchProps } from './Pitch';
import { pitchArt } from './pitchArt';
import { SvgPitch } from './SvgPitch';

/**
 * The SVG pitch on its own, for when the live pitch fails (its code did not load, or it threw):
 * the same drawing the live pitch uses where WebGL is missing, with its legend and a note.
 */
export default function PitchFallback(props: PitchProps) {
  return (
    <figure className="match-pitch-figure">
      <div className="match-pitch-stage" style={{ background: pitchArt.grass }}>
        <div className="absolute inset-0">
          <SvgPitch
            {...props}
            label={props.label ?? copy.label}
            reducedMotion={props.reducedMotion || Boolean(props.still)}
          />
        </div>
        {props.overlay}
      </div>
      <figcaption className="match-pitch-legend">
        <span>
          {props.home.name} · {copy.home}
        </span>
        <span>
          {props.away.name} · {copy.away}
        </span>
        <span>{copy.selected}</span>
      </figcaption>
      <p className="match-pitch-fallback" role="status">
        {copy.fallback}
      </p>
    </figure>
  );
}
