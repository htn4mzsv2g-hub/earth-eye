# Earth Eye — ChatGPT developer handoff

> **DEVELOPMENT PAUSED — ChatGPT takeover.**
>
> All Grok agents are idle. No further feature work and no deploys until the owner restarts development.

**Repo:** https://github.com/htn4mzsv2g-hub/earth-eye (private)  
**Production:** https://eartheye.us  
**This file is the single takeover document.** Read it before any branch, deploy, or feature work.  
**Written:** 2026-09-29 (docs-only on `cursor/restore-preaudit-globe-444e`). No Fly redeploy was performed for this handoff.

Do not merge WIP into known-good or into `main`. Do not move, retarget, or delete tag `known-good/iphone-globe-v66-b846a3e`. Do not change infrastructure. Do not put credentials or secrets in git. Do not skip tests or weaken assertions to make the suite green.

---

## Known-good mapping

Production behavior is the tag and the Fly image below. Later commits on the restore branch, including this handoff, are documentation only.

| Item | Value |
| --- | --- |
| Branch | `cursor/restore-preaudit-globe-444e` ([PR #3](https://github.com/htn4mzsv2g-hub/earth-eye/pull/3)) |
| Tag | `known-good/iphone-globe-v66-b846a3e` → `b846a3e0557bc879142aef69c2babd812757a9fc` |
| Fly | **v66**, machine `28654321fd7928`, region `dfw`, state `started` |
| Image | `registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z` |
| Digest | `sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824` |
| BUILD_ID | `git-b846a3e-202609290929` (owner/ChatGPT verified) |

Checkout the tag when you need the exact product tree:

```bash
git checkout known-good/iphone-globe-v66-b846a3e
```

### Rollback (no rebuild)

Use this only after a later deploy is bad. Do not redeploy casually. Do not rebuild.

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false --image registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z
```

Rollback twin: [`docs/ROLLOUT_KNOWN_GOOD.md`](docs/ROLLOUT_KNOWN_GOOD.md). Release map: [`docs/IPHONE_GLOBE_RELEASE_MAP.md`](docs/IPHONE_GLOBE_RELEASE_MAP.md). Short card: [`docs/controlling/KNOWN_GOOD_FLY_V66_2026-09-29.md`](docs/controlling/KNOWN_GOOD_FLY_V66_2026-09-29.md). Do not roll the globe back to v57, v62, v64, or v65.

---

## Fly verification

**Source of these values:** Chief of Staff control-plane read, 2026-09-29 ~9:51 AM CT. No redeploy was performed. This docs pass did not call Fly and did not change machines, secrets, volumes, or releases.

| Item | Value |
| --- | --- |
| App | `eartheye` |
| Machine id | `28654321fd7928` |
| Machine name | `proud-water-4069` |
| Region | `dfw` |
| State | `started` |
| Health check | passing |
| fly_release_version / Machines VERSION | **66** |
| Image tag | `registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z` |
| Image digest (`fly image show` / machine `image_ref`) | `sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824` |
| Guest | `shared-cpu-1x`, 512MB |
| Volume | `eartheye_data`, 1GB, mounted at `/data` |
| Autostop / min machines | `false` / `1` |
| BUILD_ID | `git-b846a3e-202609290929` |

Owner and ChatGPT already verified that production BUILD_ID string and physical iPhone drag and pinch. **P0 iPhone globe freeze = CLOSED** on v66.

### Docs-only commits after the known-good SHA

On `cursor/restore-preaudit-globe-444e`, commits after `b846a3e0557bc879142aef69c2babd812757a9fc` do not change the running image:

| Commit | What it is |
| --- | --- |
| `a03537e3b999972e490bc569667e41be1aba2f83` | Docs: record Fly v66 as the known-good iPhone globe rollback |
| `6a6164773509e12c2b325c92d052442bc2cc3976` | Docs: same Fly v66 block in the rollback docs |
| `6b34569bfd750ffc54f1d199d15f9aed487c2f9b` | Docs: first ChatGPT takeover draft (still said the suite was unrun) |
| `16e31bf735d091ca19c03308f30e5bce3f6f7db1` | Docs: full `b846a3e` test transcript and the recorded 65 failures. Tests and assertions are unchanged. |

Do not redeploy v66 just to record it.

Fly auth pattern from the agent box:

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly … -a eartheye
```

That prefix clears stray `FLY_API_TOKEN` / `FLY_ACCESS_TOKEN` values so the box account under `/home/box` is the one Fly uses.

---

## Build and test

Recorded run of the known-good commit. This docs pass did not re-run the suite and did not change tests or assertions.

| Item | Value |
| --- | --- |
| Commit tested | `b846a3e0557bc879142aef69c2babd812757a9fc` |
| Node | `v24.21.0` |
| npm | `11.19.0` |
| When | 2026-09-29 09:52:25–09:53:19 CDT |
| Full transcript | [`docs/HANDOFF_FULL_TEST_LOG_b846a3e.txt`](docs/HANDOFF_FULL_TEST_LOG_b846a3e.txt) |
| Scan summary | [`docs/HANDOFF_BUILD_TEST_SUMMARY_b846a3e.md`](docs/HANDOFF_BUILD_TEST_SUMMARY_b846a3e.md) |

Exact commands:

```bash
npm ci
npm run build
npm test
```

`npm test` runs `node scripts/run-unit-tests.mjs`.

| Command | Exit |
| --- | --- |
| `npm ci` | 0 |
| `npm run build` | 0 |
| `npm test` | **1** |

Result: **5523 tests, 5457 pass, 65 fail, 1 skipped.**

Node reporter lines in the transcript:

```text
ℹ tests 5523
ℹ pass 5457
ℹ fail 65
ℹ skipped 1
ℹ duration_ms 35918.049573
```

**Do not skip tests or weaken assertions to green the suite. Keep all 65 failures visible.** The full transcript is the record. Do not truncate it, delete failing cases from it, or replace it with a green rerun that changed the tests.

An earlier draft of this file said the suite was unrun on a Node v22.14.0 cloud VM (`TESTS_PENDING_LOCAL_RUN`). That note is retired. The authoritative result is the Node v24.21.0 transcript linked above.

---

## Data-driven simulated traffic

Read together:

- Charter truthfulness: [`docs/controlling/PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md`](docs/controlling/PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md) §9 (observed vs inferred vs simulated vs estimated; never present a guess, placeholder, or generated artifact as an observation).
- Upstream roads/traffic: [`docs/controlling/UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md`](docs/controlling/UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md) §4 (roads and traffic row) and §5 (traffic and road truth rules).

Rule for Earth Eye vs upstream God's Eye View:

- God's Eye View may use **simulated** or **provider-estimated** traffic when that mode is labeled as simulated or estimated. GEV’s own description treats individual vehicle positions as not live observations.
- Earth Eye’s **production real-data default** must not present synthetic cars, particle traffic, or invented speeds as live observations.
- Keyless TomTom street traffic must not show simulated cars as real. The honest states are **KEY REQUIRED**, or an explicit **SIMULATED** label only when that mode is deliberately allowed (a disclosed dev or illustrative path).
- Honest **SIMULATED** is not a silent fallback that looks like measured traffic.
- Road geometry is not traffic. `NO DATA`, provider failure, stale data, and “no reported incident” stay distinct. None of them is an all-clear.
- No fabricated observations. A missing source stays a missing source.

---

## Remaining bugs and unfinished features

Honest status for the incoming developer. “Verified” here means owner, ChatGPT, or a recorded milestone already accepted it. This docs pass did not re-test the product and did not change tests.

| Item | Status | Evidence / gate |
| --- | --- | --- |
| P0 iPhone globe freeze (drag + pinch) | **CLOSED — verified** | Owner physical iPhone on Fly v66. BUILD_ID `git-b846a3e-202609290929`. Do not reopen by redeploying an older image. |
| Fly v66 control plane (machine, image, digest, health) | **Recorded — verified by Chief of Staff ~9:51 AM CT** | Values in the table above. Not re-queried by this docs commit. |
| Unit suite on `b846a3e` | **65 failures remain visible** | 5523 tests, 5457 pass, 65 fail, 1 skipped. Exit 1. Do not skip or weaken assertions to green it. |
| EE-EVENTS-5 / EE-EVENTS-6 | **Unfinished** | EE-EVENTS-4 milestone says history/retractions and FOLLOW/retention were not started. Stop remains in force until the owner restarts. |
| Aircraft Cockpit | **Not fully productized** | Directive requires a reconstructed telemetry view from an authorized track, terrain/imagery, and disclosed models. It is not an onboard camera, aircraft sensor, or proof of mission/intent. See the cockpit spec. |
| ATC / COMMS audio | **Gated — do not implement** | Broadcastify is **PERMISSION REQUIRED** (owner gate). LiveATC is **THIRD-PARTY BLOCKED**. No scrape, proxy, autoplay, or unauthorized audio. Do not implement audio until permission is recorded. |
| Google Photoreal / Path A | **NEEDS KEY / billing gate** | Not verified as production photoreal. No key creation or billing in this handoff. |
| OpenAI Analyst | **AO-0 scaffold hard-off** | AO-1 waits on an owner key and billing approval. Do not invent a key or turn paid calls on. |
| AUTH (Google / Apple / email) | **OAuth gates — owner-gated where incomplete** | OAuth and email credentials stay owner-gated. No fake provider buttons. Preserve owner `LOGIN_*` access. |
| DelDOT / Maryland live video | **Permission pending** | Camera embed permission is still pending for some live video sources. Do not treat held packs as approved. |
| TomTom street traffic | **Keyless must not look real** | See the simulated-traffic section. **KEY REQUIRED** or an honest **SIMULATED** label only. |
| Non-3D browser re-audit | **Still recommended — unverified this pass** | SELECT → UNDERSTAND → INSPECT → ASK on `https://eartheye.us/?ee_non3d=1` for the same real object. Prior notes claimed audit-10 unit journeys passed locally; this handoff did not re-run them. |
| Upstream parity / GEV delta | **Docs exist — no wholesale merge** | Matrix and reconciliation rules are in the controlling upstream spec plus [`docs/UPSTREAM_PARITY.md`](docs/UPSTREAM_PARITY.md) and [`docs/PARITY_STATUS.md`](docs/PARITY_STATUS.md). There is no `docs/UPSTREAM_DELTA_REVIEW.md` on this branch. Do not wholesale-merge God's Eye View. |

---

## WIP pointers

**Do not merge these into known-good or `main`. Do not deploy them.**

WIP park is done. Exact facts:

- Branch `wip/chatgpt-handoff-2026-09-29` tip **`6ee111c15642a717b9f13321824ba248b9c1cc02`**.
- Draft PR #5: https://github.com/htn4mzsv2g-hub/earth-eye/pull/5 (**DO NOT MERGE**).
- That tip contains a real `wip-parked/` snapshot (**7 files**) past the restore line it was branched from. It is **not** an empty restore-only tip.
- The full test log is also at `wip-parked/HANDOFF_FULL_TEST_LOG_b846a3e.txt` on that branch. The same full log stays committed on this restore/handoff branch at [`docs/HANDOFF_FULL_TEST_LOG_b846a3e.txt`](docs/HANDOFF_FULL_TEST_LOG_b846a3e.txt).
- Omissions: the full divergent atlas-eye history and the ~89-file tree were **not** uploaded. Secrets and `node_modules` were omitted. RESIL stays on `cursor/sat-celestrak-resilience-abf1` @ `596af727b718186cc4a936ae1d6847fbab0db129` (`596af72`), [PR #4](https://github.com/htn4mzsv2g-hub/earth-eye/pull/4). **DO NOT MERGE. DO NOT DEPLOY.**

The seven `wip-parked/` files at `6ee111c`:

- `wip-parked/README.md`
- `wip-parked/OMISSIONS.md`
- `wip-parked/HANDOFF_FULL_TEST_LOG_b846a3e.txt`
- `wip-parked/snapshot-from-local-c6ef09d/HANDOFF.md`
- `wip-parked/snapshot-from-local-c6ef09d/docs/EE_IPHONE_GLOBE_FREEZE_REGRESSION_2026-09-29.md`
- `wip-parked/snapshot-from-local-c6ef09d/docs/UPSTREAM_DELTA_REVIEW.md`
- `wip-parked/snapshot-from-local-c6ef09d/scripts/ee-iphone-globe-probe.mjs`

| Pointer | Where it points | How to treat it |
| --- | --- | --- |
| `wip/chatgpt-handoff-2026-09-29` | **`6ee111c15642a717b9f13321824ba248b9c1cc02`**. Draft [PR #5](https://github.com/htn4mzsv2g-hub/earth-eye/pull/5). Real 7-file `wip-parked/` snapshot, not an empty restore-only tip. | **DO NOT MERGE. DO NOT DEPLOY.** |
| `cursor/sat-celestrak-resilience-abf1` | `596af727b718186cc4a936ae1d6847fbab0db129` ([PR #4](https://github.com/htn4mzsv2g-hub/earth-eye/pull/4)) | Unfinished RESIL-01. Not part of the WIP park snapshot. Not production. |
| `fix/audit10-workflow` | `d78c49cd3bc4313077823965dd11d1f7d2138cf5` | Divergent historical WIP versus the local atlas-eye line (remote tip is a squashed Fly v58 audit-10 checkpoint). In this clone that SHA is an ancestor of the restore branch. Checking it out drops the later iPhone globe fixes. Not the known-good tree. |
| Local atlas-eye tip | `c6ef09d852db1675f501d54d8c27d1897334804d` | **History not on GitHub.** Parent recorded as `e91d7a6ea9ca49b65f9f19f0bbed08024b0760c3`. The ~89-file tree was not uploaded. Do not recreate, force-push, merge, or deploy that history. |

`origin/work/fly-v58-checkpoint-2026-09-29` is the same SHA as `fix/audit10-workflow`. `origin/handoff/2026-09-29` (`b7259df`) is an older docs branch off `main`. Neither is production.

`origin/main` is `2afd3788ef605e036fea63919e63998013e12908` (gods-eye-view handoff). It is not Fly v66.

Older handoff text named audit-10 SHAs `dc51575`, `bfe24f9`, `b15ea56`, `258ea66`, `5ae5e08`, and `b48f4b0`, plus freeze-patch names `5e56f29`, `ebafb9a`, and `e91d7a6`. Those objects are **not** in this clone. Do not check them out. `e91d7a6` is the recorded parent of the local atlas-eye tip above; it is still not on origin.

---

## Controlling documentation

Copied into [`docs/controlling/`](docs/controlling/) for this takeover. These files govern interpretation. They do not, by themselves, authorize code, deploys, billing, provider activation, or audio.

| Document | Role |
| --- | --- |
| [`PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md`](docs/controlling/PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md) | Top-level quality standard, including truthfulness |
| [`CONTROLLING_SPEC_STACK_2026-09-29.md`](docs/controlling/CONTROLLING_SPEC_STACK_2026-09-29.md) | Priority order for the stack |
| [`UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md`](docs/controlling/UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md) | Upstream pin, delta matrix, roads/traffic rules, simulated-traffic clarification |
| [`AIRCRAFT_COCKPIT_DIRECTIVE_2026-09-29.md`](docs/controlling/AIRCRAFT_COCKPIT_DIRECTIVE_2026-09-29.md) | Cockpit is reconstructed telemetry presentation, not onboard video |
| [`AIRCRAFT_ATC_AUDIO_COMMS_DIRECTIVE_2026-09-29.md`](docs/controlling/AIRCRAFT_ATC_AUDIO_COMMS_DIRECTIVE_2026-09-29.md) | Broadcastify **PERMISSION REQUIRED**; LiveATC blocked; no audio until permission is recorded |
| [`COMMS_DIRECTIVE_2026-09-29.md`](docs/controlling/COMMS_DIRECTIVE_2026-09-29.md) | Public-safety / live communications amendment (short form; owner chat text remains authoritative) |
| [`KNOWN_GOOD_FLY_V66_2026-09-29.md`](docs/controlling/KNOWN_GOOD_FLY_V66_2026-09-29.md) | Short known-good Fly v66 card |

The stack also names `FINAL_ENGINEERING_BUILD_DIRECTIVE_2026-09-29.md` and `LIVE_WORLD_AUDIT_REMEDIATION_FULL_2026-09-29.md`. Those two files were **not** in the upload copied here. Do not invent them. Related in-repo mirrors that already existed include [`docs/OPERATOR_UX_DIRECTIVE_2026-09-29.md`](docs/OPERATOR_UX_DIRECTIVE_2026-09-29.md), [`docs/AUTH_DIRECTIVE_2026-09-29.md`](docs/AUTH_DIRECTIVE_2026-09-29.md), [`docs/OPENAI_ANALYST_DIRECTIVE_2026-09-29.md`](docs/OPENAI_ANALYST_DIRECTIVE_2026-09-29.md), [`docs/GOOGLE_PHOTOREAL_OWNER_STEPS.md`](docs/GOOGLE_PHOTOREAL_OWNER_STEPS.md), and [`docs/SOURCE_REGISTRY_COMMS.md`](docs/SOURCE_REGISTRY_COMMS.md).

Lower documents are read consistently with the higher ones. No document authorizes fabricated activity, secret exposure, a permission bypass, or a parallel application.

---

## Secrets

Never commit credentials or secrets. That includes:

- `.reviewer-cred.local`
- `LOGIN_*`, `REVIEWER_*`, `SESSION_SECRET`
- Fly tokens (`FLY_API_TOKEN`, `FLY_ACCESS_TOKEN`)
- API keys (Google, Cesium ion, TomTom, OpenAI, OpenSky, AIS, and the rest)
- `.env` files that hold secrets
- `node_modules/`, `200/` (stray Fly cache)

Reviewer access, if it is still set, is an optional second account. Names and the revoke path are in [`docs/REVIEWER_ACCESS.md`](docs/REVIEWER_ACCESS.md). Do not paste passwords into git, issues, or chat archives.

Revoke the temporary reviewer when the audit is done (agent box):

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly secrets unset REVIEWER_USER REVIEWER_PASS -a eartheye
```

That unsets names only. It does not print secret values. Owner `LOGIN_*` stays. Do not run it as part of this paused handoff unless the owner asks.

---

## Do not do these

- Do not redeploy Fly, including “redeploy so the docs match.”
- Do not move, retarget, or delete `known-good/iphone-globe-v66-b846a3e`.
- Do not merge WIP into known-good or `main`.
- Do not change infrastructure (machine size, volume, region, autostop, min machines, secrets).
- Do not start EE-EVENTS-5/6, Cockpit productization, ATC audio, Photoreal billing, AO-1, or OAuth until the owner restarts.
- Do not present synthetic cars as live traffic observations.
- Do not skip tests or weaken assertions to green the suite. Keep all 65 failures visible.
