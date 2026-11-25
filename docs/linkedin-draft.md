# LinkedIn post draft

On a smog day, can my family keep today’s plans, or should we change them?

That question guided SaansAI, my project for Google for Developers × Hack2skill PromptWars Virtual Challenge 06. Pick an Indian city, set up your household and commute, and the first screen gives you actions for today. It explains when a flexible activity could move, what you can do indoors on a zero-cost budget, and how a change in travel might affect petrol spending.

One design decision mattered early. The lowest forecast hour can still be too polluted to recommend outdoor play. SaansAI checks the forecast, nearby station reports and the household’s schedule before suggesting a time. The screen labels CPCB station AQI, OpenAQ measurements and CAMS modeled US AQI separately.

I used React, TypeScript, Tailwind and Hono, with GitHub Pages and Render. Gemini’s first prompt selected one guidance topic. The revised prompt can select a second when the user asks about two decisions. The app applies the thresholds, performs the calculations and supplies the exact wording and sources from its reviewed catalog.

I supplied the challenge requirements and evaluation priorities, configured the provider keys and confirmed the Render deployment. Earlier AI-assisted prototyping and Google Antigravity helped produce the app, tests and documentation. Codex audited the live site and generated the latest engineering changes. We checked the results against real API responses, browser runs and reproducible tests.

A regional model and reference monitor can inform a decision. Conditions on a school route or inside a home can still differ.

Try the [live application](https://jatinkumar11954.github.io/AQI/) or see the [project and evaluation evidence](https://github.com/jatinkumar11954/AQI).

#PromptWars #GoogleForDevelopers #AirQuality #Gemini
