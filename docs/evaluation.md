# SaansAI release evaluation

26 November 2026 IST · PromptWars Virtual Challenge 06

The assessment covers the repository, dependency lock, Node and Pages builds, public frontend, Render API, upstream sources, and deterministic rules behind the assistant and simulator. Findings are based on executed checks, application code and provider documentation. No competition score was measured.

## Ranked findings and fixes

| Severity | User impact | Remediation and evidence |
|---|---|---|
| High | A fresh particulate monitor could hide an independently available CPCB relay report and its India-scale caution. | Fetch and cache the sources independently. Label their units, time and AQI scales separately. A fresh conflicting report blocks a recommendation for flexible outdoor activity. API and planner tests cover the distinction. |
| High | A user arriving after a free Render instance went idle could run out of browser wait time before conditions loaded. | Allow up to 75 seconds on the deployed frontend, show a progress message after 2.8 seconds, retry one transient forecast GET, and preserve planner edits during recovery. The browser test controls the clock and response. |
| High | Uncached Gemini requests could quickly exhaust the provider’s quota. A single selected topic sometimes omitted one part of a question, and the prompt included context that the model did not need. | Coalesce identical requests, cache approved topic IDs, bound attempted calls and validate one or two topic IDs. Reduce prompt inputs and filter common personal contact details. The tests count upstream calls and cover malformed replies and 429. |
| High | Render terminated TLS before forwarding requests to Node. The assistant rejected its own public origin with HTTP 403 when accessed directly on the Render site. | Recognize Render’s documented service origin for same-site POSTs. The GitHub Pages CORS allowlist remains exact. A regression test exercises the proxy URL and a disallowed origin. |
| Medium | The landing page prioritized metrics and left personalization buried in navigation. | Lead with household actions and a direct planner link. Explain trade-offs in the planner and budget tiers. Playwright follows this path while a forecast is loading. |
| Medium | Chrome reported a CSP violation caused by a runtime validation optimization probing dynamic evaluation. | Configure Zod for its supported jitless mode. The CSP retains its existing prohibition on dynamic script evaluation. |
| Medium | The shared client loaded secondary views and fallback provider code before most users needed them. | Split secondary views and keyless providers, downsize the skyline, skip background auto-refresh, and keep provider caches bounded. Initial JS fell from about 113.08 to 109.13 kB gzip locally. The skyline went from 72.22 to 42.38 kB. |
| Medium | Earlier releases had mobile overflow, transient navigation contrast, and a forecast-hour shift overlap bug. | The earlier remediation preserved a single mobile column, stable contrast and complete forecast-hour interval checks. These paths remain covered by browser and domain tests. |

## Reproducible local evidence

| Check | Result |
|---|---|
| TypeScript/build | `npm run check`, `npm run build` and `npm run build:pages` passed. Vite emitted its static frontend, and the full build emitted Node and Worker bundles. |
| Vitest coverage | 49 of 49 tests passed in six files. The critical modules defined in `vitest.config.ts` reached **90.85% statements, 96.23% lines, 83.97% branches and 88.99% functions**. |
| E2E and accessibility | 18 of 18 desktop and mobile Chromium runs passed. Axe’s WCAG 2.0, 2.1 and 2.2 A/AA rule tags returned zero violations in all five views and the location dialog. Keyboard tests exercise skip link, modal focus, Escape and focus restoration. |
| Concurrency and failure handling | Fixtures verify 25 identical-city requests use three shared public-feed calls. Twelve identical classification requests make one Gemini call. Tests also exercise missing and stale data, all upstream failures, bad inputs, invalid AI output, 429 and app quota. |
| Dependencies and secrets | `npm audit --json` reported zero known advisories. The baseline scan of the trees of all six reachable Git commits found zero credential-pattern matches and no tracked local secret or IDE metadata paths. The production-configured Pages HTML and JavaScript scan also found zero matches. These checks are scoped and do not establish the absence of every possible vulnerability. |
| Baseline deployment | Lighthouse 13.6.0 mobile measured **99 performance, 100 accessibility, 96 best practices and 100 SEO**. FCP 817 ms, LCP 2,102 ms, TBT 40 ms, CLS 0.0088. Chrome reported a Zod probe blocked by CSP. |

## Remaining limitations

- Reference monitors and the regional CAMS grid have distinct location and coverage limits. The CPCB relay can lag or omit sites. The app links directly to the official India National AQI and withholds time windows when the required data is stale or missing. It uses no indoor measurements or street-level exposure model.
- The simulator estimates petrol tailpipe CO₂, fuel and fare spending, and an outdoor PM2.5 concentration-time proxy. It does not measure inhaled dose, health outcomes, lifecycle emissions or community participation.
- Gemini routes questions to a finite reviewed library. Nuanced questions can receive partial coverage or the unsupported response. The contact detail filter catches common formats. The app asks users to avoid supplying identifiable or medical information.
- Rate limits and caches are per process. Render’s reverse proxy may group users under a shared socket address. App limits can therefore affect multiple households. No sustained load test was performed against the free instance.
- Chromium and axe checks are partial accessibility evidence. Screen-reader testing with assistive hardware, full WCAG 2.2 AA conformance and other browser engines are outside this audit. Hindi support covers selected tips and assistant topics.
- Docker runtime execution and Cloudflare publication were outside the release scope.

See the [requirement matrix](requirements.md), [data methodology](methodology.md), [demo script](demo.md) and [development journal](journal.md).
