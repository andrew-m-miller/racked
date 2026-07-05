# Phase 8 — Component Decomposition & Routing

`RackedTracker.jsx` is the app's center of gravity at ~1150 lines: day tabs,
exercise cards, finisher card, rest timer, session summary, PR toast, and
top-level state and view switching all in one file. It works, but every new
surface (Phase 7's insights and detail view) adds to it, and its breadth makes
re-renders wide and changes risky. This phase splits it and makes views
addressable — deliberately sequenced **after** Phase 6 so the extraction is
covered by tests as it happens.

## Features

### 1. Extract view components
- Pull self-contained pieces into their own files: `ExerciseCard`,
  `FinisherCard`, `RestTimer`, `SessionSummary`, `PRToast`, and the day-tab bar.
- Keep the inline-style system and existing prop shapes; this is a structural
  refactor, not a redesign — behavior stays byte-for-byte identical.
- `RackedTracker.jsx` becomes a thin composition + state root.

### 2. Client-side routing
- Replace the state-driven view switching with a small **hash-based** router so
  views (workout / progress / recap / plan editor / onboarding / exercise
  detail) are URL-addressable and the browser back button works — important for
  the installed PWA. Hash routing avoids server rewrites and stays compatible
  with the `base: "/racked/"` GitHub Pages path.
- No heavy router dependency required; a tiny hash-route hook fits the app's
  scale and the no-dependency-creep ethos.

### 3. Shared state boundary
- Lift `logs` / `plan` / `weighIns` and their loaders out of the mega-component
  into a small context (or minimal store) so the extracted components read what
  they need instead of receiving deep prop chains.
- This is what actually shrinks the re-render surface: a logged set need only
  re-render the affected card and summary, not the whole tree.

## Data / schema changes
- None. This is an internal refactor — storage, progression, and recap logic are
  untouched.

## Out of scope
- Any behavior or visual change (a diff that alters output is a bug here).
- Rewriting `storage.js` / `progression.js` internals.
- Adopting a full framework router or a state library beyond a lightweight
  context.

## Dependency
- Phase 6's test coverage of the pure modules, plus a first pass of render tests
  on the extracted components, so the refactor is verifiably behavior-preserving.
