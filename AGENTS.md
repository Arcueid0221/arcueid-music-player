# Repository Guidelines

## Project Structure & Module Organization

`src/domain/` contains browser-independent types and playlist rules. `src/core/` owns playback state, audio integration, and use-case orchestration. Browser services and data providers live in `src/services/`; DOM, Shadow DOM styles, waveform rendering, and floating-window behavior live in `src/ui/`. Public entry points are `src/index.ts`, `src/player-element.ts`, and `src/create-player.ts`.

Keep tests beside their modules as `*.test.ts`. Use `public/` for demo audio and lyrics, `examples/` for integration samples, and `docs/` for the architecture, public API, and compatibility contracts. Treat `dist/` as generated build output.

## Build, Test, and Development Commands

- `npm install`: install the locked dependencies.
- `npm run dev`: start the Vite development server.
- `npm test`: run the Vitest suite once.
- `npm run test:watch`: rerun tests as files change.
- `npm run build`: run strict TypeScript checks and build ESM, IIFE, sourcemaps, and declarations.
- `npm run preview`: serve the production build locally.

No separate lint or formatting command is currently configured.

## Coding Style & Architecture

Use TypeScript with two-space indentation, single quotes, and no semicolons. Follow existing naming: `camelCase` for variables and functions, `PascalCase` for classes and types, and kebab-case filenames.

Keep `domain/` independent of DOM, network, and audio APIs. UI code must send intent through controllers rather than mutating the store or audio element. Providers read and normalize data; they do not write to a host CMS. Keep floating-window geometry separate from playback state.

## Testing Guidelines

Use Vitest and descriptive `describe`/`it` blocks. Add focused colocated tests for behavior changes, especially playlist rules, lifecycle cleanup, providers, persistence, and browser fallbacks. There is no configured coverage threshold; protect affected branches with meaningful assertions and run `npm test` plus `npm run build` before submission.

## Commit & Pull Request Guidelines

Follow the established Conventional Commit-style history: `feat:`, `fix:`, `docs:`, or `refactor:` followed by a concise imperative summary. Pull requests should describe the behavior and motivation, list verification performed, link relevant issues, and include before/after screenshots for UI changes.

## Public Contracts & Integrations

Treat package exports, Web Component attributes/events, `createMusicPlayer()`, provider interfaces, and documented music API shapes as stable contracts. Host applications own playlist data, authentication, backend writes, and deployment. Document and test any approved contract change; update generated `dist/` artifacts only through `npm run build`.
