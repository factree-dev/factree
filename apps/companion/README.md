# Factree companion UI

Source for `/factree:ui`. The plugin ships the built output in `plugins/factree/ui/`.

- `src/` — React 19 + TypeScript browser app, built with Vite
- `server/` — Node server with no dependencies: parses spec and plan markdown, reads events and session files, serves a JSON API and a server-sent event stream that fires when anything in the workspace changes (its hello carries a build id, so open pages reload after a rebuild)
- `shared/types.ts` — the data shapes both sides use
- `test/` — Vitest tests for the parsers, live state, links, tabs and sessions

```
npm install
npm run dev        # server on :4748 against ../../tests/fixtures/workspace, UI on :5173
npm test
npm run build      # builds and copies into plugins/factree/ui
```
