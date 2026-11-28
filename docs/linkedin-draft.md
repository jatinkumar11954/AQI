# SaansAI — PromptWars Virtual Challenge 06 Journey

On a polluted morning in an Indian city, a single AQI number doesn't tell a household what to actually *do*—whether kids can play outside, when to air out a room, or whether switching a commute cuts exposure and fuel spending.

That problem drove **SaansAI**, built for **Google for Developers × Hack2skill PromptWars Virtual Challenge 06**:

**1. Honest Data Provenance Over Single-Number Shortcuts**
SaansAI keeps three live data layers separate and clearly timestamped:
- **Open-Meteo CAMS** for modeled US AQI, PM2.5/PM10, and 48-hour outlooks
- **OpenAQ v3** for nearby station mass concentrations (`µg/m³`)
- **CPCB / India API relay** for India-scale AQI and pollutant sub-indices
When a nearby monitor reports elevated pollution, conservative safety screens block timed outdoor suggestions rather than guessing.

**2. Genuine Gemini Routing With Deterministic Safety**
Instead of letting an LLM invent health advice or AQI numbers, Gemini routes the household's question (stripped of personal identifiers and schedule hours) to **one or two approved topic IDs** via strict JSON schema. SaansAI then computes thresholds, personalizes guidance for children, older adults, shift hours, and budgets, and renders reviewed citations (`AirNow`, `US EPA`, `CPCB`)—with labeled Rules fallback if Gemini is ever unavailable.

**3. Killing the 60-Second Cold Start on Vercel (`bom1`)**
Moving from cross-origin GitHub Pages + Render free tier (~50–60s idle wake-up) to same-origin **Vercel Hobby (Fluid Compute in Mumbai `bom1`)** cut cold `/api/ready` latency to **~0.4 seconds** and eliminated CORS overhead.

**4. Measured Engineering Quality**
- **59 / 59** unit & API tests passing (**99.5% overall line coverage**, **100% server line coverage**)
- **20 / 20** Desktop & Pixel 7 Mobile Playwright journeys passing (**0 axe WCAG 2.2 violations**)
- **100 / 100** Desktop Lighthouse scores (**90 Perf / 100 A11y / 100 Best Practices / 100 SEO** on Mobile)
- **0** dependency advisories (`npm audit`) and verified live production smoke tests across 6 Indian cities

Try the live app: **https://aqi-tau.vercel.app**
Repository & evaluation evidence: **https://github.com/jatinkumar11954/AQI**

#PromptWars #GoogleForDevelopers #Gemini #AirQuality #TypeScript #React #Vercel #WebAccessibility
