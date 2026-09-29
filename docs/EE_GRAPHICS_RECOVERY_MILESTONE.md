# EE-GRAPHICS-RECOVERY — Non-3D audit mode milestone

**Shipped:** 2026-09-29 (America/Chicago)  
**Findings:** [`EE_GRAPHICS_RECOVERY_FINDINGS.md`](./EE_GRAPHICS_RECOVERY_FINDINGS.md)  
**Rollback tip:** Fly **v54** `registry.fly.io/eartheye:deployment-01M3PEW4KQQ6ZC1V00HM0C2C8J`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v55** |
| Image | `registry.fly.io/eartheye:deployment-01M3PF6A8C16K7RCZZV5T9265S` |
| Commit | `b48f4b0` + dirty working tree (graphics recovery + EE-EVENTS-2 coexistence; not a clean tag) |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Non-3D URL | `https://eartheye.us/?ee_non3d=1` (session required) |
| Photoreal / billing | untouched |
| LOGIN_* / CSP / auth | untouched |

## Delivered

1. Detect/catch Cesium/WebGL graphics init failure (incl. supports-WebGL-but-init-failed).
2. High-contrast banner: “3D view is unavailable… You can still explore available data.” — **Retry 3D** | **Continue without 3D**; Logout remains on dock.
3. Non-3D shell uses same real APIs/permissions/records/timestamps/source-health/selection — no mocks, no fake SUCCESS.
4. Map-dependent actions labeled UNAVAILABLE with clear why; Analyst map actions → UNAVAILABLE.
5. Deliberate `?ee_non3d=1` test entry (same auth). A stored flag does not apply to a normal visit.
6. Regression tests: `src/app/graphicsRecovery.test.mjs`.

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PEW4KQQ6ZC1V00HM0C2C8J
```

## STOP

Graphics recovery / non-3D audit mode only. No Photoreal billing. No wholesale Cesium rewrite.
