# Earth Eye — developer handoff

**Checkpoint:** 2026-09-29 ~6:57 AM America/Chicago  
**Repo:** https://github.com/htn4mzsv2g-hub/earth-eye (private)  
**Work branch:** `fix/audit10-workflow`  
**Docs-only PR (earlier):** https://github.com/htn4mzsv2g-hub/earth-eye/pull/1 (`handoff/2026-09-29`)

## Deployed production ↔ source mapping

| Item | Value |
| --- | --- |
| Fly tip | **v58** (EE-AUDIT-10) |
| Fly image | `registry.fly.io/eartheye:deployment-01M3PGAHGY0RGMBPRWY6A64BD0` |
| Rollback | **v57** `registry.fly.io/eartheye:deployment-01M3PFRJK7KJW6955G5AKXH6XN` |
| Non-3D URL | https://eartheye.us/?ee_non3d=1 |

### Git commits on `fix/audit10-workflow`

| Commit | Role |
| --- | --- |
| `dc51575` | Audit-10 workflow fixes (shared selection, honesty, etc.) |
| `bfe24f9` | Import deps for audit-10 graph |
| `b15ea56` | Server world-events + milestone docs (deployable tip) |
| `258ea66` | Fly v58 release record + HANDOFF |
| **`5ae5e08`** | **UNFINISHED WIP checkpoint** — remaining dirty tree AFTER v58 deploy (auth/LIVE/CCTV/loading/UI). Not claimed as what Fly built. Review before merging to stable. |

**Fly ↔ source:** Production v58 was deployed from the local working tree at/near `258ea66` / `b15ea56` (audit-10 tip). Commit `5ae5e08` preserves extra unfinished local work so the remote branch has the full buildable application, clearly marked WIP.

**Verified 2026-09-29 (restore branch):** `dc51575`, `bfe24f9`, `b15ea56`, `258ea66`, `5ae5e08`, and `b48f4b0` are **not git objects** in this clone or on GitHub (the API returns no commit). History here is squashed: `2afd378` (gods-eye-view handoff) → `d78c49c` (v58 checkpoint + WIP). Later freeze-patch names `5e56f29`, `ebafb9a`, and `e91d7a6` (claimed v63 tip) are also absent. Do not check them out. There is no `holdContinuousRender('camera-interact')` in this tree.

**Rollback to evaluate (not v62):** Fly **v57** `registry.fly.io/eartheye:deployment-01M3PFRJK7KJW6955G5AKXH6XN` is the image the audit-10 milestone names as the tip *before* v58 / `dc51575`. Owner: the globe worked before that non-3D audit. v57 is the candidate. It is not a recorded physical drag+pinch pass. If v57 is still frozen, the older pre-graphics-recovery image is v54 `deployment-01M3PEW4KQQ6ZC1V00HM0C2C8J`. Do not use v62.

**IMPORTANT:** Fly often deploys from the Grok Bot computer tree without requiring GitHub tip. Prefer this work branch over `main` for current app source. Keep unfinished work off stable `main`.

## Audit-10 status

- Journeys: `node --test src/atlas/audit10Workflow.test.mjs` → **9/9 pass** (unit, last local run).
- Docs: `docs/EE_AUDIT10_WORKFLOW_FINDINGS.md`, `docs/EE_AUDIT10_WORKFLOW_MILESTONE.md`
- ChatGPT non-3D browser re-audit still needed for SELECT→UNDERSTAND→INSPECT→ASK on the same real object.
- Do **not** claim 3D / iPhone / aircraft movement / weather / roads verified from this work.

## Secrets — never in Git

- `.reviewer-cred.local`, `LOGIN_*`, `REVIEWER_*`, `SESSION_SECRET`, Fly tokens, API keys, `.env`, `node_modules`, `200/`

## Next for incoming developer

1. Pull `fix/audit10-workflow` (full app, not docs-only PR).
2. Re-verify 10 audit journeys on `https://eartheye.us/?ee_non3d=1` with reviewer.
3. Finish or split WIP `5ae5e08` into focused commits; do not merge WIP blindly to `main`.
4. EE-EVENTS-5/6, Cockpit, upstream delta — only after audit P0 stable in browser.
5. Owner gates unchanged (Photoreal key, OAuth, Broadcastify, etc.).

---

## Checkpoint packaging note (2026-09-29 ~7:00 AM CT)

Remote work branch omits `docs/media/` marketing GIFs (~68MB) to keep the push buildable and under size limits. Those assets are not required to build or run the app. All application source, `server/`, `public/`, tests, and HANDOFF docs are included. Tip SHA on the Grok Bot computer before push: `bb36fa8`.


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
| Tip release | **v58** (EE-AUDIT-10) |
| Image | `registry.fly.io/eartheye:deployment-01M3PGAHGY0RGMBPRWY6A64BD0` |
| Rollback | **v57** `deployment-01M3PFRJK7KJW6955G5AKXH6XN` |
| Prior | **v56** EVENTS-3; **v55** graphics non-3D |
| Branch tip | `fix/audit10-workflow` @ `5ae5e08` (WIP after deploy; see mapping above) |
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
6. CHATGPT_NON3D_AUDIT_FIXES_2026-09-29.md (**SHIPPED Fly v58 / EE-AUDIT-10**)

## Completed on Fly (recent)

| Slice | Fly | Notes |
| --- | --- | --- |
| EE-LIVE-1…5 | v45–v49 | loaders/tz, nav, LIVE EARTH, camera rank, Analyst selection coherence |
| EE-EVENTS-0…4 | v50–v57 | contract, adapters, markers, detail+RELATED, Analyst event tools |
| Graphics / non-3D | v55 | `?ee_non3d=1`; Retry 3D / Continue without 3D |
| EE-AUDIT-10 workflows | **v58** | shared selection, open camera, place select, TRACK Show, MORE logout, marker honesty, banner, empties, health scopes, event detail |

## ChatGPT non-3D audit — **SHIPPED** (EE-AUDIT-10 / Fly v58)

Evidence table: [`docs/EE_AUDIT10_WORKFLOW_FINDINGS.md`](docs/EE_AUDIT10_WORKFLOW_FINDINGS.md) · milestone: [`docs/EE_AUDIT10_WORKFLOW_MILESTONE.md`](docs/EE_AUDIT10_WORKFLOW_MILESTONE.md)  
Journeys: `node --test src/atlas/audit10Workflow.test.mjs` → **9/9 pass**.  
Non-claims: 3D / iPhone / aircraft movement / weather / roads **not** re-verified here.

**Paused / next (not started):** EE-EVENTS-5/6 FOLLOW, upstream delta import, Cockpit FPV build, ATC audio (Broadcastify owner), Photoreal billing.

## Non-3D audit entry

After reviewer login: **https://eartheye.us/?ee_non3d=1**

## Tests

Prefer focused suites under `src/events/`, `src/app/graphicsRecovery.test.mjs`, `src/atlas/analystIdentity.test.mjs`. Full dirty-branch suite has pre-existing failures — do not treat “5000 passed” as journey acceptance.

## Next steps (incoming developer)

1. Checkout `fix/audit10-workflow` @ `5ae5e08` as current buildable tip; re-run ChatGPT non-3D journeys on live v58.  
2. Treat commit `5ae5e08` as **UNFINISHED WIP** (dirty leftovers after v58). Prefer audit-10 commits through `258ea66` as the v58-aligned tip until WIP is reviewed.  
3. EE-EVENTS-5/6 only if FOLLOW has real retention/notify mechanism.  
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
