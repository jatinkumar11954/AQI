# Development journal

## 26 November 2026

### Initial Discovery & Prototype
- Started in an empty workspace. Mapped the challenge requirements before writing the implementation.
- Probed the Open-Meteo Delhi air endpoint and received HTTP 200 and timestamped modeled values. Confirmed OpenAQ v3 responds HTTP 401 without a key and that its public Explorer listed CPCB's DTU, New Delhi station as reporting. OpenAQ's free limits are 60 requests per minute and 2,000 per hour. Its free public archive arrives after 72 hours and cannot serve as a real-time fallback.
- Chose separate feeds for observed particulate measurements, modeled US AQI and weather. Chose to retain the CPCB official India AQI link and avoid deriving an official AQI from a single sensor snapshot.
- Queried Antigravity CLI in planning mode. Its first run attempted a command requiring an interactive permission and returned no review. Retried with a tool-free, tightly framed prompt.
- Added CPCB data relay fallback (`api.dharun.dev`) in `src/server/environment.ts` and `Station` union handling in `src/shared/model.ts`, `src/shared/planner.ts`, and `src/client/overview.tsx`.

### Completion, Hardening & Publishing (Google Antigravity)
- Audited the workspace and updated `.gitignore` to exclude local tool metadata, IDE folders, session logs, build outputs, and `.env` files while keeping `.env.example`.
- Implemented `src/client/styles.css`, pure Web-API `src/server/worker-assets.mjs`, `scripts/build-worker.mjs`, `wrangler.toml`, `Dockerfile`, and `.dockerignore`.
- Removed duplicate `src/server/worker-assets.d.ts` in favor of `src/server/worker-assets.d.mts`, verified `npm run check` (`tsc --noEmit`) with 0 errors and `npm run build` (`dist/client`, `dist/server.mjs`, `dist/worker.mjs`), scanned for exposed secrets/local tool files, and pushed `main` to `git@github.com:jatinkumar11954/AQI.git`.
