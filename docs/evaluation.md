# SaansAI evaluation report

**Scope:** PromptWars Virtual Challenge 06 · 26 November 2026, IST

Reviewed the React and TypeScript client, deterministic planner and simulator, Hono routes and provider adapters, Gemini request/response boundary, package lock, tests, Docker and Worker builds. Exercised the local production build with live upstream providers, and ran repeatable Chromium tests against controlled fixtures. The focused Antigravity review checked scheduling intervals and exposure units. This is an engineering evaluation and includes no competition score.

## Ranked findings and remediation

| Priority | Finding and user impact | Changes and verification |
|---|---|---|
| High | A 412 px mobile viewport expanded to about 790 CSS px. City selection, forecast controls and checklist interactions could be off-screen or blocked by overlapping regions. | Capped the mobile grid column and its children and simplified the mobile header. Replayed location search, forecast controls, checklist, simulator and assistant in the Pixel 7 viewport. The live page measured 412 CSS px for both viewport and document width. |
| High | The planner checked the start of each forecast hour against work. A slot finishing after the shift began could pass the filter. The overview also let a nearby-station notice replace stronger hazardous model advice. | Checked both ends of each forecast interval, guarded consecutive hours, and preserved the stronger severe-risk message. The overnight regression fixture includes a half-hour shift-boundary crossing. Sensitive households also get a stricter current-model threshold. |
| High | The Docker build invoked a script its build stage did not copy. Wrangler referenced a missing npm command. | Copied the build scripts, corrected the build command, removed unnecessary runtime build outputs from the Docker image and used the unprivileged Node user. The build emits `dist/server.mjs` and `dist/worker.mjs`. Docker runtime execution was unavailable on this host. |
| Medium | During navigation, interpolated active colours temporarily fell below WCAG contrast. The accessible names of the brand and Hindi control omitted visible text. | Removed navigation colour interpolation and aligned accessible and visible names. Axe passed on all five views and the city selector in desktop and mobile Chromium. |
| Medium | An unusually large provider response could occupy memory before schema validation. | Bounded streamed responses at 256 KiB, cancelled oversized bodies and avoided retrying them. Unit coverage checks an oversized response without a Content-Length. Upstream destinations are fixed and redirects are disabled. |
| Medium | Initial browser and API test failures mixed real defects with assertion problems. For example, an emissions label matched two cards, and an API rate-limit assertion reused quota consumed by invalid requests. | Made selectors exact, separated valid and malformed-request rate-limit buckets in tests, and documented the distinction between fixture and live verification. |
| Medium | A forecast minimum could be confused with a viable outdoor hour. Station relay PM indices can also be mistaken for concentrations, especially when juxtaposed with CAMS. | The UI labels the lowest eligible modeled forecast even when there is no suitable window. It displays the CPCB-derived station AQI and PM sub-indices with their own standard and timestamp. Only actual mass concentrations get µg/m³ units. |
| Low | The exposure simulator could be misread as a health result or a net comparison across all transport modes. | The calculator uses a signed, one-hour outdoor concentration-time proxy and a separately labelled petrol-only CO₂ calculation. A hand-worked test checks the monthly result, adverse changes and aggregation. The UI documents exclusions. |

No critical defect was confirmed in the tested scope. A release change moved static hosting to GitHub Pages. Without the optional HTTPS API, the site fetches public data cross-origin and answers questions through local rules. The build and API tests cover a server-backed Pages origin with a strict allowlist.

## Verification

| Check | Observed result |
|---|---|
| `npm run check` and `npm run build` | Passed. TypeScript, client, Node and Worker artifacts built. |
| `npm test` | 36 of 36 tests passed across five files. Covered US AQI boundaries, shift overlap, stale data, station units and timestamps, impact arithmetic, Gemini output validation, API quotas and provider failures. |
| `npm run test:e2e` | 16 of 16 passed in desktop/mobile Chromium. Axe checked WCAG A/AA rules on all app views and the location dialog. |
| Production Node API smoke | Fresh modeled air, weather and CPCB relay station reports returned HTTP 200 for Delhi, Mumbai, Bengaluru and Lucknow. Pune search, bad-coordinate response and grounded rules answer passed. Four concurrent city requests took 961–1,047 ms in one local run. |
| Live browser check | No page errors or axe violations on the Today view in clean desktop and Pixel 7 contexts. The 1280 px and 412 px document widths matched their respective viewports. The city dialog opened and dismissed with Escape. |
| Dependency and secret checks | `npm audit --json` reported no advisories in the resolved lockfile at check time. A pattern scan of project files returned no credential matches. Type, request and package checks are scoped evidence, not a penetration test. |
| Build size | Vite reported approximately 112 kB gzip for JavaScript and 10 kB for CSS. The local uncompressed Page Resource Timing transfer total was approximately 533 kB for the live Today view. No load-test or Lighthouse score was used. |

## GitHub Pages release verification

The GitHub Actions build and deploy jobs completed successfully on 26 November 2026 IST. Anonymous desktop and Pixel 7 browser tests returned HTTP 200, displayed fresh CAMS forecasts and CPCB station data, switched from Delhi to Pune through search, and returned a source-grounded Rules answer. Both tested layouts matched their viewports and axe returned zero violations on the public Today view. [Verified deployment](https://jatinkumar11954.github.io/AQI/) · [Successful workflow run](https://github.com/jatinkumar11954/AQI/actions/runs/45699779316)

## Remaining limitations

- **Live Gemini and OpenAQ authentication remain unverified.** No real API keys were available. Gemini success, malformed results, quota and failure paths were tested with fixtures. In live checks the assistant explicitly used Rules mode, and CPCB data came through the public relay. Gemini is a topic router, with constrained contextual responses rather than open-ended medical or lifestyle advice.
- The relay and regional model can lag or miss street-level conditions. The app has no street-level exposure model, indoor sensor, official advisory ingestion, or personal risk model. It links to CPCB's official portal. Its scheduling and ventilation thresholds are product rules rather than guarantees.
- Hosting limits are per isolate and Node limits are per process. Real deployment scale, distributed quota enforcement, concurrent nationwide load, and Docker execution were outside verified scope.
- Only Chromium was used for browser automation. Automated axe checks are partial coverage of accessibility. Hindi is available for quick tips and supported topic matching, while the full interface remains English.
- The calculator estimates petrol combustion, user-entered fuel/fare spending, and an outdoor PM2.5 concentration-time proxy. It cannot quantify net multimodal emissions, medical benefits or realized collective impact.

See [methodology](methodology.md), [requirements and verification mapping](requirements.md), and the [development journal](journal.md).
