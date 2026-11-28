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

### Live release audit and hardening

- The user supplied the challenge requirements, confirmed setting up provider keys and shared the Render service. Codex inspected the deployed Pages UI, the API and the checkout before making this release’s changes.
- The baseline mobile Lighthouse run recorded 99 performance, 100 accessibility, 96 best practices and 100 SEO. Chrome DevTools reported a CSP violation from Zod’s dynamic code evaluation probe.
- Moved household actions to the top and added a direct planner entry. Published CPCB relay AQI alongside OpenAQ concentrations, rather than silently dropping one feed when both are present. Kept severe station conditions in the deterministic safety decision.
- Matched the browser’s retry and wait behavior to Render’s free-instance wake time. Added local readiness, coalesced Gemini classifications, reduced model context, set request caps, and constrained the revised prompt to one or two approved guidance topics.
- The first regression run surfaced a missing direct planner link. Added the link and made the cold-start journey exercise a budget change before the forecast recovered. Typecheck, production build, 48 unit/API tests and all 18 Playwright runs passed after the fix.
- The [evaluation report](evaluation.md) records the quality gates and separates fixture behavior from observations in production.

### Vercel Same-Origin Migration, Architecture Audit & Demo Production
- Migrated production hosting from cross-origin GitHub Pages + Render (~50–60s cold spin-up) to same-origin Vercel Hobby (`bom1` Mumbai) at `https://aqi-tau.vercel.app` using `api/index.ts`, `vercel.json`, and CI-gated `.github/workflows/vercel.yml`.
- Resolved Node.js ESM `ERR_MODULE_NOT_FOUND` on Vercel by adding explicit `.js` relative import extensions across `api/`, `src/server/`, and `src/shared/`, removed client-asset `includeFiles` bloat, and updated the CI smoke step to target the public `Aliased` production domain.
- Fixed live-region state in `LocationDialog`, hoisted `Intl.DateTimeFormat` in `planner.ts`, normalized Gemini classification cache keys, improved `Data & methods` focus feedback and `Cleaner window` threshold clarity, and closed unit/API coverage gaps (`59/59` tests passing, `99.54%` overall line coverage, `100%` server line coverage, `20/20` live E2E + axe WCAG checks, Desktop Lighthouse `100/100/100/100`).
- Built automated Playwright + FFmpeg/TTS demo recording and assembly scripts (`scripts/record-demo.mjs`, `scripts/produce-demo.mjs`) generating the 1080p submission video, subtitles, thumbnail, and vertical reel outside the deployment bundle.
