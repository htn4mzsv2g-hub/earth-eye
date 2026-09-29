# Operator UX-2 — Follow / Cockpit / dead-buttons

**Fly:** v31 `registry.fly.io/eartheye:deployment-01M3P5F2GRDTMWX5RMYWT6A4RR` (commit `874883a`)  
**Physical iPhone gate:** INCOMPLETE (`docs/OPERATOR_UX_IPHONE_GATE.md`)  
**Auth:** left to separate AUTH stream (no session-auth / login HTML edits).

## Shipped
1. FOLLOW sticky with SELECT; STALE events `gev:awareness-subject-stale` + toasts
2. Mobile object card: SELECT/FOLLOW, STALE badge, Cockpit disabled+reason, PREV/NEXT in cockpit
3. Traffic TomTom flow legend + CT timestamp; NEEDS KEY when unkeyed
4. TRACK list highlights synced to globe selection
5. Dead-button honesty: VOICE needs OpenAI key title; GLOBE on floating compass
6. SNAP/TOUR/SHARE/NORTH/TILT remain live; no fake-car traffic in prod
7. Tests green; no push; no paid OpenAI; AO-0 hard-off
8. Deployed Fly v31
