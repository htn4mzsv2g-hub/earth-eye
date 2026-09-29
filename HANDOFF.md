# Earth Eye — developer handoff

**Updated:** 2026-09-29 ~6:51 AM America/Chicago  
**Repo (intended):** https://github.com/htn4mzsv2g-hub/earth-eye (private)  
**Local working tree:** `/workspace/atlas-eye` on Grok Bot computer  
**Branch (local):** `stage5-incident-workspaces` (dirty; Fly deploys historically from local tree **without** requiring GitHub tip)

## Do not put in Git

- `.reviewer-cred.local`, any `REVIEWER_*` / `LOGIN_*` / Fly tokens / API keys
- `.env` with secrets
- `200/` (stray Fly cache)
- Real reviewer passwords in chat archives if avoidable

**Revoke reviewer when audit done:**  
`HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly secrets unset REVIEWER_USER REVIEWER_PASS -a eartheye`

## Production (Fly `eartheye` / https://eartheye.us)

| Item | Value |
| --- | --- |
| Tip release (at handoff draft) | **v57** |
| Image | `registry.fly.io/eartheye:deployment-01M3PFRJK7KJW6955G5AKXH6XN` |
| Prior rollback | **v56** `deployment-01M3PFGP98Z97PBJPZAVSP1BGV` (EVENTS-3) |
| Non-3D graphics recovery | **v55** `deployment-01M3PF6A8C16K7RCZZV5T9265S` |
| Local `git rev-parse HEAD` | `b48f4b0` + **large dirty tree** (live code ≠ clean GitHub tip) |
| Auth | Owner `LOGIN_*`; optional `REVIEWER_*` (temp ChatGPT audit) |
| Always-on | Option C: shared-1x 512MB dfw + 1GB volume + daily snapshots 5-day |

**Auth pattern that works from the agent box:**  
`HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly … -a eartheye`

## Controlling specs (`/workspace/earth-eye-spec/`)

1. PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md  
2. FINAL_ENGINEERING_BUILD_DIRECTIVE_2026-09-29.md  
3. LIVE_WORLD_AUDIT_REMEDIATION_*  
4. UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md  
5. COMMS + AIRCRAFT_COCKPIT + AIRCRAFT_ATC_AUDIO (Broadcastify PERMISSION REQUIRED; LiveATC blocked)  
6. CHATGPT_NON3D_AUDIT_FIXES_2026-09-29.md (**P0 in flight**)

## Completed on Fly (recent)

| Slice | Fly | Notes |
| --- | --- | --- |
| EE-LIVE-1…5 | v45–v49 | loaders/tz, nav, LIVE EARTH, camera rank, Analyst selection coherence |
| EE-EVENTS-0…4 | v50–v57 | contract, adapters, markers, detail+RELATED, Analyst event tools |
| Graphics / non-3D | v55 | `?ee_non3d=1`; Retry 3D / Continue without 3D |

## Known bugs / P0 (ChatGPT non-3D audit)

1. Shared selection not reaching Analyst (“No entity selected on the globe”)  
2. Analyst open-camera map-gated  
3. Place Select vs Fly here  
4. Silent TRACK Show  
5. Logout missing in MORE (reviewer)  
6. False “GLOBE MARKERS ON” without renderer  
7. Recovery banner covers command bar  
8. Empty-state wording (live video 0)  
9. Health-scope confusion (Sources vs Events USGS)  
10. Event detail UX (IDs / timestamps / evidence)

**In progress:** executor fixing all 10 → deploy + evidence table.  
**Paused:** EE-EVENTS-5/6, upstream delta import, Cockpit FPV build, ATC audio (needs owner Broadcastify).

## Non-3D audit entry

After reviewer login: **https://eartheye.us/?ee_non3d=1**

## Tests

Prefer focused suites under `src/events/`, `src/app/graphicsRecovery.test.mjs`, `src/atlas/analystIdentity.test.mjs`. Full dirty-branch suite has pre-existing failures — do not treat “5000 passed” as journey acceptance.

## Next steps (incoming developer)

1. Finish / verify the 10 audit fixes on a **clean committed** tip; update this table with release + commit SHA.  
2. Re-run ChatGPT non-3D journeys: SELECT → UNDERSTAND → INSPECT → ASK.  
3. Then EE-EVENTS-5/6 only if FOLLOW has real retention/notify mechanism.  
4. Upstream delta matrix (`docs/UPSTREAM_DELTA_REVIEW.md`) + stuck roads root-cause — selective adapt, no wholesale merge.  
5. Aircraft Cockpit (reconstructed telemetry) + iPhone acceptance.  
6. Owner gates: Google Map Tiles key (Photoreal), OAuth/email, DelDOT/Maryland, AO-1 OpenAI, Broadcastify.  
7. Physical iPhone gate separate from EMULATION.

## Rollback example

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PFGP98Z97PBJPZAVSP1BGV
```

## Important architecture notes

- Production often ahead of GitHub `main` / old handoff tip — **always** compare Fly image vs git.  
- Authenticity first: no fake traffic/aircraft/cameras/events.  
- COMMS owner decision supersedes old radio exclusion in research audit.  
- Photoreal Path A prepared; billing/key still NEEDS KEY.
