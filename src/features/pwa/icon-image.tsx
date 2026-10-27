import { ImageResponse } from "next/og";

const INK = "#111111";
const PAPER = "#faf8f5";

/**
 * FlatMate mark: a high-contrast serif "F" (thick stem, hairline arms) on ink.
 * Drawn from rectangles so no font file is needed at build time.
 * `maskable` keeps the glyph inside the central safe zone for adaptive icons.
 */
export function renderIcon(size: number, { maskable = false } = {}) {
  const glyphHeight = size * (maskable ? 0.4 : 0.52);
  const glyphWidth = glyphHeight * 0.68;
  const left = (size - glyphWidth) / 2;
  const top = (size - glyphHeight) / 2;
  const stem = glyphHeight * 0.17;
  const hairline = Math.max(1, glyphHeight * 0.045);

  const bar = (y: number, width: number, height: number, dx = 0) => (
    <div
      style={{
        position: "absolute",
        left: left + dx,
        top: top + y,
        width,
        height,
        background: PAPER,
        display: "flex",
      }}
    />
  );

  return new ImageResponse(
    <div
      style={{ width: size, height: size, background: INK, display: "flex", position: "relative" }}
    >
      {bar(0, stem, glyphHeight)}
      {bar(0, glyphWidth, hairline)}
      {bar(glyphHeight * 0.46, glyphWidth * 0.72, hairline)}
      {/* foot serif, centred on the stem so the letter does not read as an E */}
      {bar(glyphHeight - hairline * 1.6, stem * 2.4, hairline * 1.6, -stem * 0.7)}
      {/* top serif drop at the end of the upper arm */}
      {bar(0, hairline, glyphHeight * 0.1, glyphWidth - hairline)}
    </div>,
    { width: size, height: size },
  );
}
