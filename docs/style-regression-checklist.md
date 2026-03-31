# Morpheus Style Regression Checklist

Use this checklist before shipping frontend changes.

## Theme + tokens
- The page is inside the `morpheus-theme` shell.
- New colors use theme tokens (`--m-*` or existing `--color-*`) instead of raw hex values.
- New spacing/radius/font sizes use spacing/typography tokens.

## Layout consistency
- Content respects shared container width and gutter spacing.
- Vertical rhythm matches existing sections (hero, section, card spacing).
- Mobile layouts collapse cleanly at existing breakpoints (`1024`, `768`, `480`).

## Components
- Buttons use Morpheus variants (`primary`, `secondary`, `danger`, `ghost`, `discord`) and standard sizes.
- Form controls use shared control styles (`m-input`, `m-select`, `m-textarea`, `m-checkbox`) or wrappers.
- Cards, badges, tables, alerts, and modals use shared primitives/classes.

## Accessibility
- All actionable controls are keyboard reachable.
- Focus-visible ring is present and visible on buttons, links, and form fields.
- Labels are present for all inputs.
- Text/background contrast remains readable.

## Anti-regression
- Avoid new inline `style={{ ... }}` except for dynamic values that cannot be represented by classes/tokens.
- Avoid one-off spacing and color constants in JSX/CSS modules.
- Prefer extending shared primitives over creating page-local variants.
