# Design QA

## Evidence

- Source visual truth: `docs/reference-player-1280x720.png` — the checked-out reference repository's `demo.html`, rendered locally.
- Implementation screenshot: `docs/implementation-player-1280x720.png` — `http://localhost:4173/`, rendered in the in-app browser.
- Full-view comparison: `docs/design-qa-side-by-side.png`.
- Focused player comparison: `docs/design-qa-player-focus.png`.
- Responsive evidence: `docs/implementation-mobile-390x844.png`.
- Desktop viewport: 1280 × 720 CSS px; source and implementation are both 1280 × 720 pixels at density 1. No density normalization was required.
- Mobile viewport: 390 × 844 CSS px at density 1.
- Compared state: bottom-left anchored player, detail panel closed, paused state. The implementation intentionally uses the local demo playlist rather than the reference cloud playlist.

## Findings

No actionable P0/P1/P2 visual findings remain for the stated goal: preserve the reference player's compact, bottom-corner, light-card/purple-accent interaction pattern while simplifying the architecture rather than cloning it pixel-for-pixel.

- Fonts and typography: both use a compact sans-serif hierarchy. The implementation has clearer optical weight separation, non-wrapping song metadata, and readable 11–13 px utility copy.
- Spacing and layout rhythm: the implementation is deliberately wider/taller than the reference mini player so waveform seeking and text-labelled controls have usable targets. The bottom-left anchoring, compact card, control grouping, rounded frame, and expandable details remain aligned with the reference pattern.
- Colors and tokens: the white/pale card, purple accent, muted secondary copy, and dark surrounding canvas map closely to the source. State colors meet the component's semantic needs.
- Image quality and asset fidelity: the reference album art and page background are not copied because the supplied local tracks contain no cover assets and the task is a refactor, not a visual clone. The implementation does not insert a fake cover or substitute CSS-drawn imagery. The functional Canvas waveform is real audio data with a thin-line fallback.
- Copy and content: Chinese controls are explicit and accessible. The implementation replaces the reference icon-font-only transport controls with text labels; this is an intentional accessibility and dependency trade-off.

## Comparison History

1. Initial functional pass found a P0 recursive seek loop when a remembered playback time was restored after metadata became available. The controller's metadata subscription called `seek()` before unsubscribing, which re-emitted the same snapshot.
2. Fix: moved delayed restore seeking into `AudioEngine.seekWhenReady()`, using a one-time `loadedmetadata` listener. Also changed the demo to start with its detail panel closed, matching the compact source state.
3. Post-fix evidence: desktop and 390 px mobile screenshots render without overflow; clean-browser console check reports zero errors. The revised side-by-side and focused comparisons are the evidence files listed above.

## Primary Interactions Tested

- Play and pause state transition.
- Next-track selection with automatic playback.
- Playback-mode cycling.
- Queue and lyric panel switching.
- LRC loading, active-line synchronization, and click-to-seek.
- Desktop and 390 px responsive layout.
- Browser console errors after the final fix: none.

## Follow-up Polish

- [P3] When callers provide licensed `cover` assets, add an optional compact cover slot without making it a required dependency.
- [P3] If exact source fidelity becomes a goal later, adopt a maintained icon library and offer an icon-only density preset alongside the current text-labelled controls.

## Implementation Checklist

- [x] Match the reference's anchored compact-player pattern.
- [x] Keep core controls and expandable lyrics/queue functional.
- [x] Verify real local audio and lyrics.
- [x] Verify desktop and mobile rendering.
- [x] Resolve all P0/P1/P2 findings.

final result: passed
