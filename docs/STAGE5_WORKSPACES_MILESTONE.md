# Stage 5 milestone — incident workspaces / owner admin (slice 5.1–5.2 + 5.4 start)

Date: 2026-09-29 ~3:01 AM CT (America/Chicago)

## 1. Users can do
- Ask Analyst for an **incident workspace** brief: nearby cameras/flights labelled **related≠causal** (no invented causation).
- Persist named **saved views / workspaces** via `/api/atlas/workspaces` (list/get/save/delete) on the host volume path.
- Read owner admin snapshot at `GET /api/atlas/owner-summary` (no secrets): COMMS HELD, NAV roadmap status, policy flags.

## 2. Fixed / shipped
- `src/data/incidentWorkspace.js` + Analyst tool `incident_workspace` + typed phrase / explore plan.
- `server/providers/workspaces/` store (`retainsObservations: false`) + middleware wired in `local.js`.
- Owner-summary endpoint notes COMMS (Broadcastify HELD / LiveATC blocked) and NAV roadmap (Orbis #1 / Mapbox #2, NEEDS_KEY).
- Mobile shell: weather-alerts in event-detail open; cleanup listeners on destroy.
- `eventDetail` CustomEvent global fallback hardened.
- NAV-0 audit written (`docs/NAV0_AUDIT.md`); amendment mirrored to earth-eye-spec. **No NAV keys / no live NAV.**

## 3. Providers verified
- No new billable providers. Workspaces are local volume JSON only.
- Fly secrets unchanged (no TomTom/Mapbox). OSRM/FOSSGIS inventory documented in NAV-0 only.

## 4. Tests
- 68/68: incidentWorkspace, workspaces store, eventDetail, COMMS-0, stage2Policy, directions, navigationPolicy.

## 5. Perf
- Incident brief is in-memory nearby query (bounded radius/limit); workspaces payloads capped (64 KB body).

## 6. Limits
- Permitted history (5.3) not started. Hardening beyond mobile/eventDetail is light.
- Broadcastify still HELD. LiveATC blocked. NAV spend not opened. iPhone lag open. No push. Option C unchanged.

## 7. Next
- Deploy this slice to eartheye (Option C) after commit.
- Stage 5.3 permitted history + further hardening.
- NAV-1 design only after Stage 5 solid + owner spend OK (see NAV0_AUDIT).

## 8. SHA / release / rollback
- Branch: `stage5-incident-workspaces`
- SHA: `d7193f0`
- Release: **Fly v22** live — image `registry.fly.io/eartheye:deployment-01M3P2SYG9W7NVZM8FG84T9FFT` (~3:00 AM CT). Machine `28654321fd7928` check 1/1. Verified: healthz 200; `/` 401; signup 403; owner-summary/workspaces/collection-health 401 unauthenticated. Option C unchanged. No push. No TomTom/Mapbox keys.
- Rollback: Fly v21 `registry.fly.io/eartheye:deployment-01M3P26BJ9B8YS4PH2HZ3635ME`
