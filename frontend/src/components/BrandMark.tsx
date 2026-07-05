/**
 * Science Workbench brand mark — a life-science DNA double helix.
 *
 * `BrandGlyph` is a pure stroke glyph that inherits `currentColor`, so it can be
 * dropped anywhere (avatars, empty states, buttons). `BrandLogo` wraps it in the
 * app's clay rounded-tile identity for headers and hero spots.
 */

interface GlyphProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function BrandGlyph({ size = 24, className, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Two mirrored strands of the double helix */}
      <path d="M16 4 C 23 7, 23 13, 16 16 C 9 19, 9 25, 16 28" />
      <path d="M16 4 C 9 7, 9 13, 16 16 C 23 19, 23 25, 16 28" />
      {/* Base-pair rungs at the widest points of each loop */}
      <path d="M11 10 H 21" opacity={0.85} />
      <path d="M11 22 H 21" opacity={0.85} />
      {/* Nucleotide nodes at the crossing points */}
      <circle cx="16" cy="4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="28" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface LogoProps {
  /** Side length of the rounded tile in px. */
  size?: number;
  className?: string;
  /** Tailwind rounding class for the tile. */
  rounded?: string;
}

export function BrandLogo({ size = 28, className = '', rounded = 'rounded-[8px]' }: LogoProps) {
  return (
    <div
      className={`shrink-0 grid place-items-center bg-gradient-to-br from-clay-400 to-clay-600 text-white shadow-subtle ${rounded} ${className}`}
      style={{ width: size, height: size }}
    >
      <BrandGlyph size={Math.round(size * 0.62)} strokeWidth={2.1} />
    </div>
  );
}
