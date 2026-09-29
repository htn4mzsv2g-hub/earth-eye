# EE-AUDIT-10 — Milestone (workflow fixes)

**Shipped:** 2026-09-29 ~6:56 AM America/Chicago  
**Findings:** [`EE_AUDIT10_WORKFLOW_FINDINGS.md`](./EE_AUDIT10_WORKFLOW_FINDINGS.md)  
**Branch:** `fix/audit10-workflow` @ `b15ea56` (+ working-tree files included in Fly image)  
**Rollback tip:** Fly **v57** `registry.fly.io/eartheye:deployment-01M3PFRJK7KJW6955G5AKXH6XN`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v58** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PGAHGY0RGMBPRWY6A64BD0` |
| Commit (branch tip) | `b15ea56` |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** |
| Non-3D URL | `https://eartheye.us/?ee_non3d=1` (session required) |
| Photoreal / billing | untouched |
| LOGIN_* / CSP | untouched |
| Journeys | `src/atlas/audit10Workflow.test.mjs` **9/9 pass** |

## Delivered (all 10)

1. Shared selection (Cesium-independent) + “What is this?” / `selected_entity`; viewer close **RETAIN**
2. Analyst open camera → shared CAMERAS viewer; SUCCESS only after open; works without 3D
3. Place **Select location** independent of Fly; Fly UNAVAILABLE in non-3D
4. TRACK Show not silent; list/details without Cesium; Follow/Cockpit UNAVAILABLE
5. Logout + SECURITY discoverable in MORE → ACCOUNT (desktop + mobile)
6. Non-3D: **Map unavailable** + “N records have map locations” (not GLOBE MARKERS ON)
7. Recovery banner compact/dismissible; under command bar; Retry no duplicates
8. CCTV empty states: catalog-wide no live vs area vs filters; offer clips/stills
9. Health scopes: provider / collection / layer / rendered
10. Event detail: human titles, CT-labeled times, expandable IDs, source links, pagination, RELATED ≠ causation

## Explicit non-claims

3D / iPhone / aircraft movement / weather / roads **not** verified in this slice.

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PFRJK7KJW6955G5AKXH6XN
```

## STOP

Audit-10 only. No EE-EVENTS-5+.
