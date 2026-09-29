# EE-EVENTS-4 — Analyst event queries + same-state actions

**Shipped:** 2026-09-29 (America/Chicago)  
**Base / rollback:** Fly v56 `deployment-01M3PFGP98Z97PBJPZAVSP1BGV`
**Release:** Fly v57 `deployment-01M3PFRJK7KJW6955G5AKXH6XN`

## Scope shipped

Analyst can query the selected World Event (`event details`), list real ranked RELATED cameras, open the existing World Events detail surface, and show the existing World Events layer when the 3D renderer is available. Non-3D and graphics-failed map actions are honestly `UNAVAILABLE`; detail and data queries continue without WebGL.

No EE-EVENTS-5 history/retractions or EE-EVENTS-6 FOLLOW/retention work was started.

## Verification

Focused Analyst and World Events tests pass. Production `/healthz` returned 200, unauthenticated `/` returned 401, `/login` returned 200; Fly v57 machine checks passed.

**STOP before EE-EVENTS-5.**
