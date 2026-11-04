# AutoTwin design system

AutoTwin ships two themes on the same tokens and components, switched with `<html data-theme>` (`src/theme/themeMode.ts`, remembered per browser):

| Theme | Default | Look | File |
|---|---|---|---|
| **Pastel Glass** | yes | Light frosted-glass panels over a soft pink / blue / lavender gradient, layered cards with depth, pink→violet→blue gradient for primary actions | `src/theme/pastel.css` |
| **Studio** (dark) | | Obsidian / titanium / ice cyan / signal amber, described below | `src/theme/theme.css` |

Switch with the moon/sun button in the top bar, or Ctrl+K → "Switch theme".

## Pastel Glass

| Token | Value | Contrast on glass over pink / blue (#fbeaf3 / #eaf1ff) |
|---|---|---|
| `--text-primary` | #1e2142 | 13.4 / 13.7:1 |
| `--text-secondary` | #474c72 | 7.1 / 7.3:1 |
| `--text-muted` | #5d628a | 5.1 / 5.2:1 |
| `--accent-cyan` (primary accent) | #4a5fd6 | 4.7 / 4.8:1 |
| `--accent-ice` (design B) | #2f68c9 | 4.6 / 4.7:1 |
| `--accent-pink` (eyebrows, active icon) | #a8306a | 5.5:1 |
| `--status-success` / `-warning` (also design A) / `-danger` | #127a54 / #955600 / #bd2f4b | 4.6 / 5.0 / 4.9:1 |
| `--status-model` | #6544cc | 5.6:1 |
| White text on the primary gradient (#c63f86 → #7a55d6 → #3f5fd0) | | 4.7 / 5.1 / 5.6:1 |
| Badge inks on their tints (e.g. estimated #864d00 on #ffeecc) | | ≥ 5.5:1 |
| Chart series (dark-theme colours × 0.62 via `inkFor()`) on the stage | | ≥ 3.7:1 (graphics minimum is 3:1) |

**Materials.** Panels, tiles, hero, sidebar and top bar are frosted glass: 58–62% white, `blur(18px) saturate(160%)`, a white hairline and a soft violet-tinted shadow, with a 92% white fallback when blur is unsupported. The 3D stage is a light pink-to-blue studio gradient. The twin canvases are transparent, and the AI Insights / Design Lab 3D viewers use `<ThemeBackground />`. Status and state chips are light tints with darkened inks; nothing relies on colour alone.

**What the image-prompt "mobile app" brief maps to here.** AutoTwin is a desktop engineering app. The pastel look applies to every page, and at phone width (390px) the rail is a 68px icon strip and pages stack with no horizontal overflow (tested on Dashboard, Brake twin and Design Lab).

---

## Studio (dark): Precision Engineering Studio

Source: `src/theme/theme.css` (loaded last), `src/shell/shell.css`, `src/ui/twinWorkspace.css` and `src/ui/viewportInfo.css`.

## Palette: Obsidian / Anodized Titanium / Ice Cyan / Signal Amber

| Token | Value | Use | Contrast on `--surface-1` |
|---|---|---|---|
| `--studio-bg` | #080c13 | App background | n/a |
| `--studio-nav` | #0b1420 | Top bar / rail base | n/a |
| `--surface-1` | #111b28 | Panels (solid) | n/a |
| `--surface-2-solid` | #172334 | Buttons, raised rows | n/a |
| `--surface-raised` | #1d2b3f | Selected segment | n/a |
| `--surface-hover` | #22344d | Hover | n/a |
| `--text-primary` | #f2f6fc | Text | 16.0:1 |
| `--text-secondary` | #aab8c9 | Labels | 8.6:1 |
| `--text-muted` | #8495aa | Metadata | 5.7:1 (6.4:1 on --studio-bg) |
| `--accent-cyan` | #54d4ec | Primary action, focus, active | 9.9:1 (button text #04151c on cyan: 10.6:1) |
| `--accent-ice` | #8dc9f0 | Design B, secondary accent | |
| `--status-success` / `--status-warning` / `--status-danger` | #50c99b / #f1b85d / #f07683 | Pass / review or estimate / fail | 8.4 / 9.7 / 6.3:1 |
| `--status-model` (`--status-ai`) | #a995fa | Model output, AI | 6.9:1 |
| `--hairline` / `--hairline-strong` | 9% / 16% white | Borders | |

Contrast ratios were computed from the hex values with the WCAG relative-luminance formula, against #111b28 unless stated otherwise.

**Legacy aliases (do not remove):** `--bg --bg-2 --surface --surface-2 --surface-3 --border --border-strong --text --text-2 --muted --accent --accent-2 --amber --green --red --violet` and their `-soft` variants point at the tokens above. Page CSS, `solver.css`, `insights.css` and the printable Reports sheet read these names, and the Reports sheet overrides them locally for a light print theme.

## Materials

| # | Material | Where |
|---|---|---|
| 1 | Background `--studio-bg` | App, inputs |
| 2 | Raised surface `.panel` (solid `--surface-1`, 14px radius, hairline, soft shadow) | All engineering content |
| 3 | Elevated solid `--surface-raised` | Selected segments, hover rows |
| 4 | Floating translucent `.glass` / `.vp-btn` / `.vp-readout .r` / `.vp-legend` (60% fill, blur 14px, saturate 140%) | Only over the 3D stage |
| 5 | Interactive glass `.vp-btn` with hover and active states (active = solid cyan) | Viewport tools |
| 6 | Modal `.at-palette` (86% fill, blur 20px, scrim 55%) | Command palette |

Each glass rule has an opaque fallback (`@supports not (backdrop-filter)`). Reading content (the open "Model info" body, warnings) is always solid.

## Type

Inter for UI (14px body), JetBrains Mono with an IBM Plex Mono fallback for values (`tabular-nums` on every engineering number), Montserrat 800 for the wordmark only.
Page title 28px/700, panel title 13px/600 sentence case, KPI value 26px mono, field label 13px, metadata 11–12px. Uppercase is reserved for short section labels (`.section-label`, `.sub-title`, nav group labels) and badges.

## Shape, space, motion

- Radii: 6 (badges), 8 (buttons, chips), 10 (overlays), 14 (panels, viewport).
- Spacing: 4px scale (`--space-1` … `--space-6`).
- Motion: 150ms colour transitions, 160ms palette pop, 220ms rail width, all with `--ease-out`. `prefers-reduced-motion` reduces every transition and animation to ~0 and stops the sidebar wheel.

## Components

| Pattern | Class / component |
|---|---|
| Navigation rail | `.at-side`, `.at-nav-group`, `.at-nav` (active = cyan tint, inset outline and a 3px edge bar) |
| Breadcrumb | `.at-crumb` (AutoTwin / Section / Twin module) |
| Status chip | `.status-chip` + `.at-dot` (text + dot, never colour alone) |
| Command palette | `CommandPalette` (Ctrl/Cmd+K; Ctrl/Cmd+B toggles the rail) |
| Buttons | `.btn`, `.btn.primary`, `.btn.warn`, `.btn.danger`, `.btn.sm` (min height 32 / 28px) |
| Segmented / tabs | `.seg`, `.tabs` |
| Inputs | `.num`, `.select`, `.text`, range slider, `.switch` |
| Provenance | `Badge` kinds: input, derived, model, estimated, theoretical, demo, drawing, assumed (label + colour + tooltip) |
| Notes / warnings | `.note`, `.note.amber` (solid, left rule) |
| Twin layout | `TwinWorkspace` (Parameters / Focus stage / Telemetry toggles; state remembered per browser) |
| Viewport info | `ViewportInfo` (closed by default) |
| Focus | `--focus-ring`: 2px background gap + 2px cyan, on every interactive element |
