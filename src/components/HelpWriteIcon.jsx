// "Help me write" mark: a pencil with an eraser band and a pointed tip, redrawn from the reference.
// Drawn along a horizontal axis, then rotated 45° so the tip points down-left.
// Stroke uses currentColor; the button supplies grey-on-dark (white on hover).
export default function HelpWriteIcon({ size = 18, strokeWidth = 13, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="4 6 176 176"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform="translate(20 165) rotate(-45)">
        <path d="M0 0 L28 -27 L166 -27 Q176 -27 176 -17 L176 17 Q176 27 166 27 L28 27 Z" />
        <path d="M144 -27 L144 27" />
      </g>
    </svg>
  );
}
