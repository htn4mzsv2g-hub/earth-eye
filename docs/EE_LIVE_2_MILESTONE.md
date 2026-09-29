# EE-LIVE-2 — Canonical IA + capabilities + login cleanup

**Shipped:** 2026-09-29 (America/Chicago)  
**Directive:** Live World / Audit Remediation Phases 2–4  
**Master:** FINAL ENGINEERING BUILD DIRECTIVE  
**Findings:** [`EE_LIVE_2_FINDINGS.md`](./EE_LIVE_2_FINDINGS.md)  
**Rollback tip:** Fly **v45** `registry.fly.io/eartheye:deployment-01M3PBHNM92GYJQKGC33DZBCH2`

## Production

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Fly release | **v46** (complete) |
| Image | `registry.fly.io/eartheye:deployment-01M3PBZDAY3DHAY5V29FGQGBJC` |
| Health | `GET https://eartheye.us/healthz` → `{"ok":true}` |
| Auth gate | unauthenticated `/` → **401**; `/login` → **200** with CURRENTLY UNAVAILABLE (no Apple/Google setup leakage) |
| Photoreal / billing | untouched |
| LOGIN_USER / LOGIN_PASS | untouched |

## What users can now do

1. Use the **same destination names** on desktop and mobile: GLOBE, TRACK, CAMERAS, ANALYST, MORE.
2. Non-owners see a **sanitized capability** panel (no secret names/values) via Keys → capabilities.
3. Owners keep detailed provider-status / POWER UP paths; reviewers still cannot call provider-status.
4. Public login no longer exposes Apple/Google developer setup or env instructions.

## Verified sources / permissions

- Capabilities derived from presence of existing server env only (Google Maps, AISStream, OpenAI, FIRMS, Cesium ion, TomTom, EE_OPENAI_ANALYST gate). No new keys opened.
- `/api/atlas/provider-status` owner-gated; `/api/atlas/capabilities` authenticated like other globe APIs.

## Tests

- `src/atlas/canonicalIa.test.mjs`
- `server/providers/capabilities.test.mjs`
- `src/tooling/eeLive2Auth.test.mjs`
- Updated: `mobileLayout.test.mjs`, `productionAuth.test.mjs` (login leakage expectations)

## Rollback

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PBHNM92GYJQKGC33DZBCH2
```

## Stop

EE-LIVE-2 only. Do not auto-start LIVE-3 (LIVE EARTH preset).
