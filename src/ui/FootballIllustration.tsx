/** A small ball: white with a dark pentagon, as on the state pages. */
function Ball({ x, y, r }: { x: number; y: number; r: number }) {
  const s = r / 17;
  return (
    <g
      className="loading-ball"
      style={{ transformOrigin: `${x}px ${y}px`, transformBox: 'view-box' }}
    >
      <circle cx={x} cy={y} r={r} fill="#ffffff" stroke="#23342a" strokeWidth={2.5 * s} />
      <path
        d={`M${x} ${y - 8 * s}L${x + 7 * s} ${y - 3 * s}L${x + 4.5 * s} ${y + 5.5 * s}H${x - 4.5 * s}L${x - 7 * s} ${y - 3 * s}Z`}
        fill="#23342a"
      />
      <path
        d={`M${x} ${y - 8 * s}V${y - r} M${x + 7 * s} ${y - 3 * s}L${x + r} ${y - 6 * s} M${x + 4.5 * s} ${y + 5.5 * s}L${x + 10 * s} ${y + 14 * s} M${x - 4.5 * s} ${y + 5.5 * s}L${x - 10 * s} ${y + 14 * s} M${x - 7 * s} ${y - 3 * s}L${x - r} ${y - 6 * s}`}
        stroke="#23342a"
        strokeWidth={1.8 * s}
      />
    </g>
  );
}

/**
 * The full-page state art (Feedback artboard): `loading` rolls a ball along a dotted line,
 * `error` is a blank scoreboard, `lost` a corner flag with the ball out of play.
 */
function StateIllustration({
  kind,
  className,
}: {
  kind: 'loading' | 'error' | 'lost';
  className: string;
}) {
  if (kind === 'loading')
    return (
      <svg
        viewBox="0 0 120 64"
        width="120"
        height="64"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <path d="M4 58H116" stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M8 58H54"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="2 8"
        />
        <path
          d="M42 30H54M38 40H52"
          stroke="var(--meter-gold)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <Ball x={80} y={36} r={20} />
      </svg>
    );
  if (kind === 'error')
    return (
      <svg
        viewBox="0 0 260 150"
        aria-hidden="true"
        focusable="false"
        className={`football-illustration ${className}`}
      >
        <path d="M10 140H250" stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
        <rect x="40" y="22" width="180" height="92" rx="12" fill="#14251e" />
        <rect x="52" y="34" width="156" height="68" rx="8" fill="#1b2e25" />
        <path d="M76 68H104M156 68H184" stroke="#354a3d" strokeWidth="8" strokeLinecap="round" />
        <circle cx="130" cy="60" r="4" fill="#354a3d" />
        <circle cx="130" cy="76" r="4" fill="#354a3d" />
        <path
          d="M92 114V140M168 114V140"
          stroke="var(--muted)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M196 14L206 4M206 22L220 18M188 8L190 -4"
          stroke="var(--meter-gold)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <g>
          <circle cx="214" cy="128" r="12" fill="#ffffff" stroke="#23342a" strokeWidth="2" />
          <path d="M214 123L218 126L216.5 131H211.5L210 126Z" fill="#23342a" />
        </g>
      </svg>
    );
  return (
    <svg
      viewBox="0 0 260 150"
      aria-hidden="true"
      focusable="false"
      className={`football-illustration ${className}`}
    >
      <rect x="0" y="40" width="170" height="110" rx="12" fill="var(--color-field)" />
      <rect x="34" y="40" width="34" height="110" fill="var(--color-field-stripe)" />
      <rect x="102" y="40" width="34" height="110" fill="var(--color-field-stripe)" />
      <path d="M0 44H166V150" fill="none" stroke="#ffffff" strokeWidth="4" />
      <path d="M166 62A18 18 0 0 1 148 44" fill="none" stroke="#ffffff" strokeWidth="3" />
      <path d="M166 44V6" stroke="var(--muted)" strokeWidth="3" strokeLinecap="round" />
      <path d="M166 6L190 14L166 22Z" fill="var(--color-gold)" />
      <path
        d="M176 132Q196 118 212 120"
        fill="none"
        stroke="var(--meter-gold)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="3 7"
      />
      <circle cx="230" cy="122" r="17" fill="#ffffff" stroke="#23342a" strokeWidth="2.5" />
      <path d="M230 114L237 119L234.5 127.5H225.5L223 119Z" fill="#23342a" />
    </svg>
  );
}

/** Original, theme-aware SVG illustrations. No raster assets or network requests. */
export function FootballIllustration({
  kind = 'career',
  className = '',
}: {
  kind?: 'career' | 'world' | 'match' | 'honours' | 'loading' | 'error' | 'lost';
  className?: string;
}) {
  if (kind === 'loading' || kind === 'error' || kind === 'lost')
    return <StateIllustration kind={kind} className={className} />;
  return (
    <svg
      viewBox="0 0 240 180"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`football-illustration ${className}`}
    >
      <circle cx="120" cy="90" r="76" fill="var(--art-green)" />
      <path d="M33 132H207M48 148H192" stroke="var(--line)" strokeWidth="2" />
      <circle cx="42" cy="54" r="5" fill="var(--color-gold)" />
      <path
        d="M192 38V54M184 46H200M48 104V116M42 110H54"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {kind === 'world' || kind === 'match' ? (
        <g>
          <rect x="57" y="41" width="126" height="99" rx="12" fill="var(--color-field)" />
          <path
            d="M83 42V140M108 42V140M133 42V140M158 42V140"
            stroke="#ffffff"
            strokeOpacity=".06"
            strokeWidth="12"
          />
          <g stroke="#f3f5de" strokeOpacity=".75" strokeWidth="2">
            <path d="M66 51H174V130H66ZM120 51V130M66 73H84V108H66M174 73H156V108H174" />
            <circle cx="120" cy="90" r="15" />
          </g>
          <circle
            cx="100"
            cy="76"
            r="7"
            fill="var(--color-gold)"
            stroke="#153c2d"
            strokeWidth="2"
          />
          <circle cx="143" cy="109" r="7" fill="#f5f0da" stroke="#153c2d" strokeWidth="2" />
          <path
            d="M100 76Q129 65 143 109"
            stroke="var(--color-gold)"
            strokeWidth="2"
            strokeDasharray="4 5"
          />
          <circle cx="131" cy="84" r="4" fill="#fff" />
        </g>
      ) : kind === 'honours' ? (
        <g>
          <path d="M90 49H150V87Q150 115 120 119Q90 115 90 87Z" fill="var(--color-gold)" />
          <path
            d="M90 61H72V76Q72 98 95 99M150 61H168V76Q168 98 145 99"
            stroke="var(--meter-gold)"
            strokeWidth="8"
          />
          <path
            d="M120 116V136M105 137H135"
            stroke="var(--meter-gold)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M120 64L125 75L138 77L129 86L131 99L120 93L109 99L111 86L102 77L115 75Z"
            fill="#153c2d"
          />
          <path
            d="M98 54V84"
            stroke="#fff"
            strokeOpacity=".4"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g>
          <path
            d="M96 43L70 52L51 88L73 100L85 81V137H155V81L167 100L189 88L170 52L144 43Q120 61 96 43Z"
            fill="var(--color-field)"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M97 46L120 67L143 46M55 84L74 95M166 95L186 84"
            stroke="var(--color-gold)"
            strokeWidth="6"
          />
          <path
            d="M93 89H106M136 87L148 90V102L142 108L136 102Z"
            stroke="#f5f0da"
            strokeWidth="3"
          />
          <path
            d="M116 89H126V120M110 120H132"
            stroke="#f5f0da"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M89 132H151" stroke="var(--color-gold)" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}
