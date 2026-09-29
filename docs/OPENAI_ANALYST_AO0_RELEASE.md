# AO-0 release note — Fly v29 (AI OFF)

- Commits: `425f604` scaffold; `5c6dd45` release note
- Fly: **v29** `registry.fly.io/eartheye:deployment-01M3P4QSPACE9NQ2B9A2KNY2JY`
- Paid OpenAI Analyst: **OFF** (`EE_OPENAI_ANALYST` unset by default; turn → `ANALYST_UNAVAILABLE`)
- Live `/api/atlas/openai-analyst/*` sits behind app auth (same as other atlas APIs)
- No keys invented; no GitHub push; no Mapbox; Broadcastify HELD; LiveATC blocked
- Core Analyst deterministic tools unchanged; `AI_SUMMARIES_ENABLED=false`
