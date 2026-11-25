# AI Tooling, Attribution & Prompt Evolution

This document records the actual AI workflow used across the development and submission preparation of **SaansAI**.

## 1. Accurate Tool Attribution & Development Boundary

| Phase | Environment / Tooling | Scope of Work |
|---|---|---|
| **Phase 1: Core Prototype & Feeds** | Earlier local workspace generation + Antigravity CLI (`agy`) planning query | Mapped [requirements.md](requirements.md), verified Open-Meteo & OpenAQ behavior, and built the shared domain logic (`src/shared/*`), Hono server (`src/server/{index,app,environment,gemini,upstream,worker}.ts`), CPCB relay fallback, React views (`src/client/{main,overview,sections,ui}.tsx`), and baseline test/config files (`tests/{api.test.ts,planner.test.ts,fixtures.ts,journeys.spec.ts}`). |
| **Phase 2: Completion, Hardening & Publishing** | **Google Antigravity** (primary environment, Gemini 4 Hydrogen) | Audited the workspace, hardened `.gitignore` to exclude all local tool configs/IDE files/secrets, implemented `src/client/styles.css`, pure Web-API `src/server/worker-assets.mjs`, `scripts/build-worker.mjs`, `wrangler.toml`, `Dockerfile`, `.dockerignore`, additional unit/E2E specs (`tests/{assistant.test.ts,impact.test.ts,server.test.ts,e2e.spec.ts}`), `README.md`, prompt evolution docs, and published to GitHub (`git@github.com:jatinkumar11954/AQI.git`). |

## 2. Prompt Evolution

1. **Source Separation & Safety Framing**
   - *Goal*: Keep regional modeled US AQI (Open-Meteo CAMS) strictly separate from observed station measurements (OpenAQ v3 / CPCB relay) and official India National AQI links (CPCB).
   - *Outcome*: Added staleness windows (`freshAir`, `modelNow`, `nearbyParticleCaution`) so stale feeds or conflicting station readings conservatively withhold outdoor activity windows.

2. **Structured LLM Classification Boundary**
   - *Goal*: Prevent hallucinated health claims, fabricated numbers, or prompt injection in the assistant route (`/api/ask`).
   - *Outcome*: Constrained Gemini (`src/server/gemini.ts`) to `temperature: 0` JSON topic classification against `TOPICS`, with all guidance text, figures, and source citations produced deterministically by `composeAnswer` (`src/shared/assistant.ts`) and automatic rules fallbacks (`unconfigured`, `quota`, `unavailable`).

3. **Submission Audit & Repository Hygiene (Google Antigravity)**
   - *Goal*: Ensure the repository excludes local tool configs/caches/logs/secrets, preserves genuine Git commits without fabricated history, includes deployment/documentation artifacts, and publishes cleanly to GitHub via SSH.
   - *Outcome*: Completed missing stylesheet/worker-asset/deployment modules, removed duplicate declaration files, verified `tsc --noEmit` and `npm run build` (Vite client + Node server + Cloudflare Worker bundle), scanned all tracked files for credentials/sensitive configs, and pushed to `main`.

## Final review prompts

The first direct Antigravity architecture prompt was blocked by interactive tool permissions. A tool-free version asked for three failure modes involving modeled forecasts, sensitive households and catalog-constrained Gemini. A longer source-excerpt audit timed out. A shorter independent prompt asked what evidence would verify schedule overlap and the simulator’s exposure and fuel calculations. It returned checks for full-interval overlap and concentration-time units, which were compared with the implementation and tests.

The user supplied the requirements and evaluation criteria. Google Antigravity contributed styling, Worker bundling, GitHub Pages setup, tests and documentation alongside earlier prototype scaffolding. Test counts and live observations came from executed checks, and the public post is a draft.
