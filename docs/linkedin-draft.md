# LinkedIn draft

On a smog day, the question I wanted SaansAI to answer was simple. Can my family keep today’s plans, or should we change them?

I worked on SaansAI for Google for Developers × Hack2skill PromptWars Virtual Challenge 06. A household can pick a city, enter work hours and commute details, and add a child or older adult to the plan. SaansAI checks which activities can move, whether the forecast supports an outdoor window, and what the household can do indoors without buying equipment.

A turning point came during the Antigravity review. The lowest AQI in a forecast can still be too high for outdoor play. We changed the planner to use absolute cutoffs and check the work schedule and nearby station conditions before it suggests a time. The interface keeps CPCB station data and CAMS model estimates visibly separate.

The build uses React, TypeScript, Tailwind and a small Hono API. Rules handle air-quality thresholds and the maths for petrol, fares and outdoor PM2.5. The Gemini Developer API classifies questions into a reviewed answer catalog. The early prompt asked for a broad architecture critique. Later prompts focused on two concrete checks, how a forecast interval overlaps a shift and what an exposure estimate actually measures.

I supplied the challenge goals and evaluation criteria. Google Antigravity and prior AI-assisted prototyping generated and revised project code, tests and documentation. Provider responses, browser results and command outputs were used to verify the claims. The audit surfaced a mobile overflow bug and navigation contrast issues, which the implementation pass addressed.

The remaining limitation I care about most is resolution. A city forecast and a nearby station can inform a decision, while the conditions on a school route or inside a home can still differ.

#PromptWars #GoogleForDevelopers #AirQuality #Gemini
