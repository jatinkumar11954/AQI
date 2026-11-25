# SaansAI — Urban Air Quality Assistant

SaansAI helps Indian households plan daily outdoor activities, commutes, indoor air hygiene, and routine shifts around hourly air quality forecasts and nearby monitoring station reports.

## Key Capabilities

- **Hourly Regional Forecast (`Today`)**: Displays modeled US AQI, PM2.5, PM10, weather context (Open-Meteo CAMS & Weather), and separate observed station data (OpenAQ v3 and/or CPCB station relay) with explicit timestamps and staleness checks—never conflating single station snapshots with an official India National AQI.
- **Household Daily Planner (`Daily planner`)**: Filters 24-hour forecasts by sensitive groups (children, older adults, respiratory sensitivity), work shifts (including overnight blocks), commute mode, and activity type to surface conservative, forecast-gated time windows alongside a persistent daily checklist.
- **Indoor & Low-Emission Guidance (`Indoor air`)**: Source-linked EPA and AirNow recommendations across zero-cost, low-budget, and HEPA filtration tiers, plus ventilation gating against outdoor pollution and ambient temperature (`18–32 °C`).
- **Routine & Exposure Simulator (`Impact simulator`)**: Deterministic calculator comparing petrol use, fuel/fare savings, tailpipe CO₂ proxy (`2.34 kg CO₂/L`), hypothetical community scaling, and hourly outdoor PM2.5 exposure proxy (`µg·h/m³`).
- **Source-Grounded Assistant (`Ask SaansAI`)**: Uses Gemini Developer API strictly as a structured JSON topic classifier (`temperature: 0`, strict `TOPICS` enum schema) with automatic fallback to deterministic local rules when unconfigured, quota-limited, or unavailable. All advice wording, numbers, and source citations come deterministically from verified application modules.

## Architecture & Security Boundaries

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide icons, and self-hosted Fontsource fonts (`Manrope`, `DM Sans`).
- **Server / Edge API**: Hono (`src/server/app.ts`) running on either Node (`src/server/index.ts`) or Cloudflare Workers (`src/server/worker.ts`).
- **Safety & Hardening**:
  - Strict `zod` validation for coordinates (`6–38°N, 67–98°E`), search strings, household profiles, and assistant requests.
  - Same-origin checks, `4096`-byte body limits, per-IP rate limiting, upstream caching with bounded stale fallback, and `no-store` headers on API responses.
  - Strict Content-Security-Policy (`default-src 'self'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`.
  - API keys (`OPENAQ_API_KEY`, `GEMINI_API_KEY`) stay strictly server-side and are never committed or exposed to client bundles.

## Getting Started

### Prerequisites
- Node.js `>=22.14`

### Local Development
1. Copy the environment template if you want to enable optional OpenAQ or Gemini API integrations:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```
   Open `http://127.0.0.1:4173`. Without `.env` keys, the app remains fully functional using Open-Meteo feeds, CPCB relay station observations, and the deterministic rules assistant.

### Environment Variables
See [.env.example](.env.example):
- `PORT` (default `4173`)
- `OPENAQ_API_KEY` (optional, server-only)
- `GEMINI_API_KEY` (optional, server-only)
- `GEMINI_MODEL` (optional, defaults to `gemini-3.5-flash-lite`)

## Verification

```bash
npm run check      # TypeScript strict typecheck
npm run build      # Vite client + Node server (dist/server.mjs) + Worker bundle (dist/worker.mjs)
npm test           # Vitest unit & API contract tests
npm run test:e2e   # Playwright end-to-end & axe-core WCAG 2.0 A/AA accessibility tests
```

## Deployment

- **Node.js Production**:
  ```bash
  npm run build
  npm start
  ```
- **Docker**:
  ```bash
  docker build -t saansai .
  docker run -p 4173:4173 --env-file .env saansai
  ```
- **Cloudflare Workers**:
  Configured via [wrangler.toml](wrangler.toml) using `npm run build` (`dist/worker.mjs` with embedded static assets).

## Documentation & PromptWars Artifacts

- [Requirements & Verification Matrix](docs/requirements.md)
- [Development Journal](docs/journal.md)
- [AI Tooling & Prompt Evolution](docs/ai-tooling-and-prompts.md)
- [Antigravity Session Artifacts](docs/artifacts/)
