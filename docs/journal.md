# Development journal

## 26 November 2026

### Initial Discovery & Prototype
- Started in an empty workspace. Mapped the challenge requirements before writing the implementation.
- Probed the Open-Meteo Delhi air endpoint and received HTTP 200 and timestamped modeled values. Confirmed OpenAQ v3 responds HTTP 401 without a key and that its public Explorer listed CPCB's DTU, New Delhi station as reporting. OpenAQ's free limits are 60 requests per minute and 2,000 per hour. Its free public archive arrives after 72 hours and cannot serve as a real-time fallback.
- Chose separate feeds for observed particulate measurements, modeled US AQI and weather. Chose to retain the CPCB official India AQI link and avoid deriving an official AQI from a single sensor snapshot.
- Queried Antigravity CLI in planning mode. Its first run attempted a command requiring an interactive permission and returned no review. Retried with a tool-free, tightly framed prompt.
- Added CPCB data relay fallback (`api.dharun.dev`) in `src/shared/environment.ts` and `Station` union handling in `src/shared/model.ts`, `src/shared/planner.ts`, and `src/client/overview.tsx`.

### Completion, Hardening & Publishing (Google Antigravity)
- Audited the workspace and updated `.gitignore` to exclude local tool metadata, IDE folders, session logs, build outputs, and `.env` files while keeping `.env.example`.
- Implemented `src/client/styles.css`, pure Web-API `src/server/worker-assets.mjs`, `scripts/build-worker.mjs`, `wrangler.toml`, `Dockerfile`, and `.dockerignore`.
- Removed duplicate `src/server/worker-assets.d.ts` in favor of `src/server/worker-assets.d.mts`, removed extra `dist/server/index.js` copy step from `scripts/build-worker.mjs`, added GitHub Pages workflow (`.github/workflows/pages.yml`) and static-site support, verified `npm run check` (0 errors), `npm test` (36/36), `npm run test:e2e` (16/16), `npm run build`, and `npm run build:pages`, and pushed `main` to `git@github.com:jatinkumar11954/AQI.git`.

### Evaluation and remediation

- Probed the documented, anonymous CPCB relay for four built-in cities. Kept its reported sub-indices separate from mass concentration and official city AQI.
- Reproduced mobile overflow (790 CSS pixels against a 412-pixel viewport) using actual Chromium emulation. Playwright traces showed overlapping controls blocking taps. Axe also flagged navigation contrast during transitions and visible names missing from accessible labels.
- Fixed mobile width, navigation contrast, accessible names, full forecast-hour shift overlap, provider response size limits, and the Docker and Worker build configuration. Kept configured-provider tests isolated from live-data smoke checks.
- Antigravity's concise second audit identified work-interval boundaries and dimensional validation for the calculator. Its separate long source-excerpt request timed out. Independent local tests and the report document the fixes with measured results.

### GitHub Pages release

- Switched to GitHub Actions for frontend publication. Shared provider parsing, bounded caching and timeouts between the Node API and the keyless Pages build.
- Verified that each public data provider accepts GitHub Pages cross-origin reads. Added an allowlisted HTTPS backend option for Gemini and OpenAQ. The keyless Pages assistant applies only local rules and never sends questions or household settings to a provider.
