# ADR-004: Design direction

Status: Accepted (2026-10-27)

## Context

The spec asked for a design direction decision before tokens were fixed. The owner chose a **neutral, basic, minimal aesthetic with an editorial, fashion-magazine feel** (Vogue-style) instead of picking between three options.

## Decision

An editorial minimalism language. It borrows the _feel_ of fashion magazines: high-contrast serif display type, lots of white space, hairline rules and quiet colour. It does not copy any publication's logo, name or branding.

- **Palette:** warm paper background, near-black ink, one muted grey and hairline rules. No brand accent colour. Success and error use muted green and muted red, always paired with text or an icon.
- **Dark mode:** near-black background and warm off-white ink, switched by `prefers-color-scheme`.
- **Type:** Bodoni Moda (Didone-style serif, Google Fonts, OFL licence) for headings and big numbers. Inter for body and UI text. Small uppercase, widely tracked labels for section titles and buttons.
- **Shape:** sharp corners, 1px hairline borders, no drop shadows. Avatars are the only round element.
- **Flatmate colours:** five muted tones (charcoal, taupe, sage, clay, slate) used on avatars and calendar marks, never as large fills.
- **Layout:** generous spacing, one column on phones, a single strong focal element per card.
- **Motion:** slow, soft and restrained. Fades, small upward reveals and number count-ups. No bounce, no confetti. The motion rules in SPEC-foundation still apply.

## Consequences

- Fonts add weight to the first load, so only the weights actually used are loaded (`next/font`, self-hosted by Next.js).
- With no accent colour, hierarchy comes from type size, weight and spacing, so components must get those right.
- Sharp corners and hairlines give the app a distinct look but need careful focus styles for accessibility (visible 2px outline).
- Contrast: muted text `#6b6762` on paper `#faf8f5` is about 5:1, which meets WCAG AA for body text.
