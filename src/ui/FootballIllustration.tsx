/** Original, theme-aware SVG illustrations. No raster assets or network requests. */
export function FootballIllustration({
  kind = 'career',
  className = '',
}: {
  kind?: 'career' | 'world' | 'match' | 'honours';
  className?: string;
}) {
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
