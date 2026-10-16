# Winners

The four winning projects of the [Qloo LLM Hackathon](qloo-llm-hackathon.md): one Grand Prize and three Honorable Mentions. Each section summarizes the Devpost project page, then notes what the public repo shows about its Qloo and LLM usage, as read at the 2026-10-16 crawl.

Contents:

1.  [Announcement](#announcement)
1.  [GeoTaste: Your Business Consultant Agent](#geotaste-your-business-consultant-agent)
1.  [Alloy](#alloy)
1.  [Resonance AI](#resonance-ai)
1.  [Zesty](#zesty)
1.  [See also](#see-also)

## Announcement

Qloo on X, 2025-09-08:

> We’re excited to announce the winners of the Qloo LLM Hackathon!
>
> From 2,893 global participants, four projects stood out:
>
> • 1st Place: GeoTaste – $10,000
> • Honorable Mentions: Alloy, Resonance AI, Zesty – $5,000 each

Neither the announcement, the Devpost updates, nor the forum say why these projects won. No judge comments appear on the project pages.

## GeoTaste: Your Business Consultant Agent

- Prize: Grand Prize ($10,000)
- Devpost: <https://devpost.com/software/geotaste-your-agentic-qloo-taste-business-consultant>
- Team: Guanming Wang, Vaibhav Mehra
- Tagline: "GeoTaste transforms location into business insights. Get instant market analysis, competitive intelligence and interactive visualizations from your AI agent, powered by Qloo's global business database"
- Built with (Devpost tags): chatgpt, flask, mapbox, python, qloo, railway, react, vite

What it does, per the project page: an "agentic" business consultant for any location. The user searches a location on a Mapbox map; the app pulls Qloo data for it, renders "13+ different chart types using Plotly.js", and has OpenAI's GPT-4 write a business-environment analysis, with a chat interface for follow-up consulting. Stack: React 19 with Vite and Material-UI ("glassmorphism design"), a Python Flask backend, deployed on Railway.

Qloo usage in the repo: `Backend/qloo_analysis.py` calls `https://hackathon.api.qloo.com/v2/insights` with `filter.type` set to `urn:entity:brand` or `urn:entity:place`, plus `filter.location.query` (city name) and `filter.geocode.country_code`. The helpers accept optional `signal.interests.tags` with a weight, but the app's call sites pass only city, country, and limit.

LLM usage in the repo: `Backend/chatgpt_analysis.py` calls `gpt-4.1` through the OpenAI Responses API, once to analyze a summary of the Qloo brands and places and once per chat message. No tool calling appears in that file.

Demo delivery: hosted app at <https://geotaste-production.up.railway.app/> (returned HTTP 404 at the crawl) and a [YouTube video](https://www.youtube.com/watch?v=BYOVEVoBIzk). The Devpost "Try it out" links list only the hosted app; the repo link, <https://github.com/william-Dic/GeoTaste>, was posted as a project update on Aug 13, 2025, after the deadline. The repo's last commit is 2025-07-29 and its README is the default Vite template.

## Alloy

- Prize: Honorable Mention ($5,000)
- Devpost: <https://devpost.com/software/axiom-2bn391>
- Team: ISLAM HACHIMI (solo)
- Tagline: "The Cultural Due Diligence Engine. De-risking multi-billion dollar deals by replacing gut-feel with a data-driven Cultural Compatibility Score"
- Built with (Devpost tags): fastapi, gemini, next.js, postgresql

What it does, per the project page: an autonomous analyst for mergers and acquisitions. Given an acquirer brand and a target brand, it produces a report with a "Data-Driven Compatibility Score", a "Culture Clash Report", an "Untapped Growth Analysis", an "Audience Expansion Potential" score, an interactive AI analyst chat, and PDF exports. The page pitches it against legacy consulting: "~6 minutes" instead of "4-6 Weeks". The agent follows the ReAct (Reason + Act) loop with Gemini 2.5 Pro choosing the next tool each step.

Qloo usage, per the project page: for broad brands the agent first picks "cultural proxies" (the page's example: _Mickey Mouse_ or _Marvel Studios_ for Disney), then queries Qloo's `/search` endpoint for their entity IDs and aggregates them. If Qloo has no result for a niche brand, it falls back to Gemini 2.5 Pro and Tavily web search. The page says the design targets Qloo's "Persona API", which was "not available in the hackathon", so persona analysis falls back to web search.

Qloo usage in the repo: `backend/src/services/react_agent.py` calls `https://hackathon.api.qloo.com/search` once per entity type (`brand`, `person`, `artist`, `movie`, `tv_show`, `book`, `podcast`, `place`, `destination`) until a match is found, then `/v2/insights` with `signal.interests.entities` and `filter.type=urn:tag` to collect each brand's taste tags. The persona expansion score is the overlap between the acquirer's predicted tags and the target's tags. Agent tools: `web_search`, `intelligent_cultural_analysis_tool`, `persona_expansion_tool`, `corporate_culture_tool`, `financial_and_market_tool`.

Demo delivery: hosted app at <https://alloy-web-527185366316.europe-west1.run.app/> (returned HTTP 404 at the crawl), a [YouTube video](https://www.youtube.com/watch?v=ceSU9R8ZyGw), and the repo <https://github.com/MR-GREEN1337/alloy>, whose description now reads "Cultural Due Diligence 2.0 - Winner Qloo LLM Hackathon 🏆". Stack: FastAPI, Python, SQLModel, and PostgreSQL on the backend; Next.js, TypeScript, Tailwind CSS, and shadcn/ui on the frontend.

## Resonance AI

- Prize: Honorable Mention ($5,000)
- Devpost: <https://devpost.com/software/resonance-ai-1hjbf0>
- Team: David Babu (solo)
- Tagline: "AI-powered political intelligence that creates culturally authentic campaign messaging"
- Built with (Devpost tags): adk, gcp, gemini, imagen, llm, python, qloo, streamlit

What it does, per the project page: a political campaign intelligence platform. It offers "Geographic Political Intelligence" through heatmap analysis of voter sentiment and candidate popularity; "Cultural Intelligence" from Qloo on what target demographics like, from music and entertainment to brands; and "AI-Powered Content Generation" with Gemini 2.5 Flash and Imagen 4, producing ready-to-deploy campaign packages of copy variants, visuals, cultural analysis, and deployment strategy. The author says it was a backup idea built in 2 days, so there's no custom frontend: it uses a Streamlit dashboard and ADK's built-in web UI.

Agent stack, per the project page: Google's Agent Development Kit (ADK) with a "Political Agent" for campaign analysis and a "Content Agent" for messaging, deployed on Cloud Run and Agent Engine, with a "Custom Python wrapper around Qloo's API".

Qloo usage in the repo: `resonance_agent/src/qloo.py` wraps `/search`, `/v2/insights`, `/v2/audiences`, `/v2/audiences/types`, `/v2/tags`, and `/v2/tags/types`. The agent tools call `/v2/insights` for `movie`, `brand`, `place`, `artist`, and `tv_show` entities and for `urn:tag`. The wrapper's signals cover location (`signal.location.query`), demographics (`signal.demographics.age`, `signal.demographics.gender`), audiences (`signal.demographics.audiences`), entities, and tags. The agent maps a request to audience IDs from a hard-coded list, for example `urn:audience:political_preferences:politically_progressive` and `urn:audience:hobbies_and_interests:hiking`. The Streamlit heatmaps call `/v2/insights` with `filter.type=urn:heatmap`. Agents are ADK `LlmAgent`s on `gemini-2.5-flash`.

Demo delivery: a hosted ADK agent at <https://political-agent-service-833868035966.us-central1.run.app/> (returned HTTP 404 at the crawl), a Streamlit heatmap app at <https://resonanceai.streamlit.app/> (redirected, not checked in a browser), a [YouTube video](https://www.youtube.com/watch?v=ipUumI_GKU0), and the repo <https://github.com/hazardscarn/ResonanceAI>.

The author's [LinkedIn post](https://www.linkedin.com/posts/david-babu-15047096_qloollmhackathon-adk-gemini-activity-7370472007685169152-EFcQ) about the win frames it as hyperlocal targeting "without using any personally identifiable information" and demos the North Carolina Senate race: Qloo entity heatmaps show where each party's audience and candidate is stronger, then the agent drills into underperforming locations, builds polygon geocodes, pulls Qloo insights for them, and generates posts and an Imagen image.

## Zesty

- Prize: Honorable Mention ($5,000)
- Devpost: <https://devpost.com/software/zesty>
- Team: Dharma Teja, YADALA SURYA GANESH
- Tagline: "Zesty – The Unrecommendation Engine that flips your feed"
- Built with (Devpost tags): gemini, qloo, react, render, supabase, tailwind

What it does, per the project page: "Zesty is a tool that helps people find content that is completely opposite to what they usually enjoy. Whether it’s music, movies, books, or food, Zesty uses cultural data and AI to show you something new and different." Users answer a short "Taste Journey", then Zesty "uses the Qloo API to fetch content that matches the farthest possible point from your current preferences". It adds daily reflection prompts, comfort-zone challenges, taste-evolution tracking, a "Taste Nemesis" (someone who loves what you hate), and community sharing. Stack per the page: React, Tailwind CSS, Supabase (database, auth, edge functions), and Gemini 1.5 Pro for prompts, reflections, and taste insights.

Qloo usage in the repo: `server/index.js` proxies `https://hackathon.api.qloo.com/search` and `/v2/insights` with `signal.interests.entities` and `filter.type`. For "opposite" results it posts to `/recipes/antitheses`, and elsewhere to `/v2/insights` with a body of `input` and `insight_type: 'antitheses'`. Whether the hackathon API accepted those two requests was not verified. The search route returns mock entities when no API key is set or the call fails. The LLM model string is `gemini-1.5-pro-latest`.

Demo delivery: hosted app at <https://zesty-1.onrender.com> (returned HTTP 200 at the crawl), a [YouTube video](https://www.youtube.com/watch?v=j1WDxcDquS8), and the repo <https://github.com/surya4419/Zesty>.

## See also

- [Project gallery on Devpost](https://qloo-hackathon.devpost.com/project-gallery), crawled 2026-10-16
- [GeoTaste](https://devpost.com/software/geotaste-your-agentic-qloo-taste-business-consultant), [Alloy](https://devpost.com/software/axiom-2bn391), [Resonance AI](https://devpost.com/software/resonance-ai-1hjbf0), and [Zesty](https://devpost.com/software/zesty) on Devpost, crawled 2026-10-16
- [Qloo winner announcement on X](https://x.com/Qloo/status/1965110790400151775), crawled 2026-10-16
- [Qloo LLM Hackathon](qloo-llm-hackathon.md)
- [Project gallery](project-gallery.md)
