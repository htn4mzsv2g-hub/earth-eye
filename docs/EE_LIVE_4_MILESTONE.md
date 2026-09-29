# EE-LIVE-4 — Camera relevance ranking

**Shipped:** 2026-09-29 (America/Chicago)  
**Directive:** LIVE_WORLD Phase 6 + FINAL ENGINEERING camera rules  
**Findings:** [`EE_LIVE_4_FINDINGS.md`](./EE_LIVE_4_FINDINGS.md)  
**Rollback tip:** Fly **v47** `registry.fly.io/eartheye:deployment-01M3PCJF2NJHTJ02VGFRPVCQCG`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v48** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PCXE33QXK01361QFPXHHR1` |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** |
| Photoreal / billing | untouched |
| LOGIN_* | untouched |

## Delivered

1. Viewport-bounded CCTV list ranking: in view → nearest center → nearest selected → media quality.
2. Useful-nearby cutoff (25–200 km) so Austin no longer surfaces ~1850 km distant cameras as a wall.
3. Empty state: `NO PUBLIC CAMERAS FOUND IN THIS AREA`.
4. Distance shown on cards; honest LIVE / CLIP / STILL labels preserved.
5. LIVE EARTH CCTV auto-start still deferred (global catalog load unsafe).

## Tests / checks

- `src/atlas/cctvCatalog.test.mjs` (ranking + legacy catalog)
- `src/atlas/liveEarthPreset.test.mjs` / `liveEarthController.test.mjs` (CCTV still deferred)
- Production build + `git diff --check` on touched files

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PCJF2NJHTJ02VGFRPVCQCG
```

## Stop

EE-LIVE-4 only. STOP before Analyst/LIVE-5.
