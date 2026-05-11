# AGENTS.md

## Project overview

- Desktop AUTOSAR App built with Electron, React, TypeScript, Node.js, and Vite.
- The renderer lives in `src/`.
- The Electron main process and backend services live in `electron/`.
- Tests live in `tests/`.

## Working agreements

- Check `README.md` file to understand project structure as first thing to do.
- Prefer focused changes that preserve the current Electron and React architecture.
- Keep TypeScript strictness intact; avoid `any` unless there is a clear reason.
- Do not add new dependencies unless they are necessary for the task.
- Keep UI and backend contracts aligned when changing IPC or shared types.
- Preserve ARXML parsing and editing behavior unless the task explicitly changes it.
- Codex may use subagents to divide larger tasks into parallel, well-scoped pieces when that will speed up delivery or reduce risk.
- When using subagents, keep ownership clear, avoid overlapping edits, and integrate their results back through the repo validation flow.

## Commands

- Install dependencies with `npm install`.
- Start the app in development with `npm run dev`.
- Run type checks with `npm run typecheck`.
- Run tests with `npm test`.
- Run the Electron smoke check with `npm run smoke:app`.
- Run the functional verification loop with `npm run verify:functional`.
- Build production artifacts with `npm run build`.

## Validation expectations

- After TypeScript changes, run `npm run typecheck`.
- After changing tested behavior, run `npm test`.
- After every functional code update, prefer `npm run verify:functional`.
- When a change affects packaging or startup behavior, prefer `npm run build`.
- After each implementation task, review `PLAN.md` and mark any completed checklist items as checked.
  Update plan.md with sub checklist if you're working on a point but it didn't finish completely.

## Repo-specific guidance

- Put renderer-only changes under `src/` unless native or filesystem access is required.
- Put workspace, parsing, diff, merge, and graph logic under `electron/services/`.
- Prefer updating shared contracts in `src/shared/` when renderer and main-process types must stay in sync.
- Treat `PLAN.md` as the execution tracker for the project; when a planned step is fully implemented, update its checkbox in `PLAN.md` before finishing the task.
- At the end, always update `README.md` with latest info if needed.
