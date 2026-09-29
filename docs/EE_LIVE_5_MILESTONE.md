# EE-LIVE-5 — Analyst query vs map-display coherence

**Shipped:** 2026-09-29 (America/Chicago)  
**Directive:** LIVE_WORLD Phase 7 + FINAL ENGINEERING Analyst rules + UPSTREAM RECONCILIATION same-state notes  
**Findings:** [`EE_LIVE_5_FINDINGS.md`](./EE_LIVE_5_FINDINGS.md)  
**Rollback tip:** Fly **v48** `registry.fly.io/eartheye:deployment-01M3PCXE33QXK01361QFPXHHR1`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v49** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PD8ABXGDYWVFT0VXWXYTC1` |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** |
| Photoreal / billing | untouched (AO paid OpenAI hard-off) |
| LOGIN_* | untouched |

## Delivered

1. Analyst receives the exact Earth Eye identity (id + type + source) for the globe selection.
2. Open camera / map actions use the existing Earth Eye CAMERAS viewer and shared action runner — not a parallel path.
3. Command results are SUCCESS / PARTIAL / FAILED / UNAVAILABLE from actual execution.
4. Nearby cameras use the same `rankCameras` ranking as the UI; entity queries cite sources and do not fabricate observations; query does not require display ON.
5. Honest AO-0 capability state when paid AI is off.

## Tests / checks

- `src/atlas/analystIdentity.test.mjs`
- `src/atlas/analystTools.test.mjs` (incl. EE-LIVE-5 cases)
- `src/atlas/cctvCatalog.test.mjs`
- Related flights / military suites
- Production build + `git diff --check` on touched files

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PCXE33QXK01361QFPXHHR1
```

## Stop

EE-LIVE-5 only. STOP before EE-EVENTS-0.
