# Requirements and implementation plan

| Requirement | Implementation | Verification |
|---|---|---|
| Observed pollution | India API relay of CPCB station AQI and PM sub-indices. Optional OpenAQ for measured concentrations. Separate official CPCB link. | Verify endpoint authentication and public station coverage. Exercise mapping and stale observations with fixtures. |
| Air quality and weather | Open-Meteo CAMS model, US AQI and PM hourly forecast. Separate weather and observation views. | Smoke-test real feeds. Verify partial failures, nulls and drift. |
| Household planner | City, work/commute, schedule, household and affordability rules. Conservative, forecast-gated time windows. | Test scheduling, sensitive groups, hazardous and missing weather/air cases. |
| Indoor and sustainable routines | Referenced action catalog, ventilation guidance, budget filters and checklist. | Verify source and accessibility of each action. |
| Impact and community | Petrol trip scenarios, spending, outdoor PM proxy and aggregate hypothetical participation. | Independently check equations and invalid input behavior. |
| Gemini | Developer API selects reviewed answers using environment and profile context, with explicit rules fallback. | Test configured request shape, safe output, quota and availability fallback. |
| UX and release | Mobile-first forecasts, sample profiles, keyboard and accessible data, production build. | Browser journeys, axe, contract tests, performance, security review, deployed smoke checks. |

Build forecast and advice first, then household and indoor workflows, impact and Gemini. Verify each boundary before packaging and publishing. Keep numerical output and safety guidance deterministic.
