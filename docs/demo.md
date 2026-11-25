# Screen recording plan

Record the actual release and use its live timestamps throughout. Keep the browser window and cursor visible and use a mobile viewport for the final segment.

| Time | Show | Narration and evidence |
|---|---|---|
| 0:00–0:20 | Today in New Delhi | Start with the first three actions and the planner link. Scroll to the model timestamp, US AQI label and separate CPCB station report. Explain that the station relay uses a different scale. |
| 0:20–0:43 | Location and hourly chart | Choose a city with real data and toggle 24h/48h and PM2.5. Open the data table and show a timestamp. |
| 0:43–1:13 | Daily planner | Apply the School-day household, change work or commute, and check off an action. If no window meets the policy, show why the app withholds one. |
| 1:13–1:37 | Indoor air | Show the current ventilation guidance and its reason. Switch between Zero cost, Low budget and Premium. Open a cited source and show a low-emission routine. |
| 1:37–2:02 | Impact simulator | Change from Combine errands to Try transit, edit the fare and show how signed savings and community values respond. Choose two forecast hours for the outdoor concentration-time proxy. Open assumptions. |
| 2:02–2:24 | Ask SaansAI | Ask about ventilation. Read the visible Gemini or Rules answer badge accurately and show the source. Ask a two-part question. A quota or unavailable badge identifies any Rules response. |
| 2:24–2:45 | Mobile and methods | Show the mobile city picker, Hindi quick tips and focus navigation. End on the source and evaluation documentation. |

Capture a real outage only if it occurs or explicitly use the local test harness and label the segment as a simulated failure. Keep live AQI out of prerecorded narration so the spoken figures agree with the screen.

## Evaluator samples

Use real data from the selected city. The app may withhold a cleaner window while conditions fail its safety checks.

| Sample | Inputs | What to verify |
|---|---|---|
| School-day household | Select the New Delhi preset with a child, transit, 09:00–17:00 office hours, play and a zero-cost budget. Ask “Should I move outdoor play and open the windows later?” | Compare the actions with fresh or missing data. Read the assistant mode and check linked sources. |
| Senior at home | Select the Lucknow preset with an older adult, flexible work, exercise and a low budget. Mark one action complete and reload. | Confirm the older adult guidance, stricter outdoor eligibility and persistent checklist and budget. |
| Outdoor worker | Select the Mumbai preset with a two-wheeler and 07:00–15:00 work. Set work hours to 22:00–06:00 to try an overnight shift. | Check commute guidance, shift-aware scheduling and the reason when no window is suggested. |
| Compare petrol trips | Choose Combine errands. Use 18 km now, 8 km alternative, 8 changed days, 15 km/L, ₹100/L, no added fare and 25 households. | Expect about 5.3 L less petrol, ₹533 lower fuel and fare spending, 12.5 kg lower tailpipe CO₂ and an illustrative 312 kg for 25 households. Check the formulas before changing the fare. |
