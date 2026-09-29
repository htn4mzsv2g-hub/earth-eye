# Earth Eye — ChatGPT developer handoff

**Repo:** https://github.com/htn4mzsv2g-hub/earth-eye (private)  
**Production:** https://eartheye.us  
**This file is the single takeover document.** Read it before any branch, deploy, or feature work.  
**Written:** 2026-09-29 (docs-only on `cursor/restore-preaudit-globe-444e`). No Fly redeploy was performed for this handoff.

---

## Status

**DEVELOPMENT PAUSED for ChatGPT takeover.**

All Grok Bot agents are stopped / idle. Do not start features, slices, refactors, or deploys until the owner restarts work. Do not merge WIP into known-good or into `main`. Do not move, retarget, or delete tag `known-good/iphone-globe-v66-b846a3e`. Do not change infrastructure. Do not put credentials or secrets in git.

---

## Known-good mapping

Production behavior is the tag and the Fly image below. Later commits on the restore branch, including this handoff, are documentation only.

| Item | Value |
| --- | --- |
| Branch | `cursor/restore-preaudit-globe-444e` |
| Tag | `known-good/iphone-globe-v66-b846a3e` |
| Full commit SHA | `b846a3e0557bc879142aef69c2babd812757a9fc` |
| Pull request | https://github.com/htn4mzsv2g-hub/earth-eye/pull/3 |
| Fly app | `eartheye` |
| fly_release_version / Machines VERSION | **66** |
| BUILD_ID | `git-b846a3e-202609290929` |
| Image tag | `registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z` |
| Image digest | `sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824` |
| Machine id | `28654321fd7928` (name `proud-water-4069`) |
| Region / state | `dfw` / `started`, health check passing |

Checkout the tag when you need the exact product tree:

```bash
git checkout known-good/iphone-globe-v66-b846a3e
```

Rollback twin: [`docs/ROLLOUT_KNOWN_GOOD.md`](docs/ROLLOUT_KNOWN_GOOD.md). Release map: [`docs/IPHONE_GLOBE_RELEASE_MAP.md`](docs/IPHONE_GLOBE_RELEASE_MAP.md). Do not roll the globe back to v57, v62, v64, or v65.

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
| This handoff commit | Docs: ChatGPT takeover, controlling specs |

Do not redeploy v66 just to record it.

### Rollback (no rebuild)

Use this only after a later deploy is bad. Do not redeploy casually.

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z
```

Fly auth pattern from the agent box:

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly … -a eartheye
```

That prefix clears stray `FLY_API_TOKEN` / `FLY_ACCESS_TOKEN` values so the box account under `/home/box` is the one Fly uses.

---

## WIP branches

**Do not merge these into known-good or `main`. Do not deploy them without the owner.**

| Branch | Origin tip at this handoff | How to treat it |
| --- | --- | --- |
| `wip/chatgpt-handoff-2026-09-29` | **Not on origin.** `git ls-remote origin refs/heads/wip/chatgpt-handoff-2026-09-29` returned no ref on 2026-09-29. | Parked unfinished atlas-eye / post-v58 local work. It may exist only on a developer machine and may diverge from restore history. Do not recreate, merge, or deploy it from this handoff. |
| `cursor/sat-celestrak-resilience-abf1` | `596af727b718186cc4a936ae1d6847fbab0db129` | Unfinished RESIL-01 CelesTrak resilience. Cancelled mid-flight. Tip is one commit after the restore docs tip (`596af72` “Label CelesTrak outages and accept only GP/OMM elements” on top of `6a61647`). Not production. |
| `fix/audit10-workflow` | `d78c49cd3bc4313077823965dd11d1f7d2138cf5` | Older checkpoint lineage (Fly v58 audit-10 buildable tip + unfinished WIP). In this clone that SHA is an ancestor of the restore branch. Checking it out drops the later iPhone globe fixes. Historical WIP, not the known-good tree. |

`origin/work/fly-v58-checkpoint-2026-09-29` is the same SHA as `fix/audit10-workflow`. `origin/handoff/2026-09-29` (`b7259df`) is an older docs branch off `main`. Neither is production.

`origin/main` is `2afd3788ef605e036fea63919e63998013e12908` (gods-eye-view handoff). It is not Fly v66.

Older handoff text named audit-10 SHAs `dc51575`, `bfe24f9`, `b15ea56`, `258ea66`, `5ae5e08`, and `b48f4b0`, plus freeze-patch names `5e56f29`, `ebafb9a`, and `e91d7a6`. Those objects are **not** in this clone. Do not check them out.

---

## Remaining bugs and unfinished features

Honest status for the incoming developer. “Verified” here means owner, ChatGPT, or a recorded milestone already accepted it. This docs pass did not re-test the product.

| Item | Status | Evidence / gate |
| --- | --- | --- |
| P0 iPhone globe freeze (drag + pinch) | **CLOSED — verified** | Owner physical iPhone on Fly v66. BUILD_ID `git-b846a3e-202609290929`. Do not reopen by redeploying an older image. |
| Fly v66 control plane (machine, image, digest, health) | **Recorded — verified by Chief of Staff ~9:51 AM CT** | Values in the table above. Not re-queried by this docs commit. |
| EE-EVENTS-5 / EE-EVENTS-6 | **Unfinished** | EE-EVENTS-4 milestone says history/retractions and FOLLOW/retention were not started. Stop remains in force until the owner restarts. |
| Aircraft Cockpit | **Not fully productized** | Directive requires a reconstructed telemetry view from an authorized track, terrain/imagery, and disclosed models. It is not an onboard camera, aircraft sensor, or proof of mission/intent. See the cockpit spec. |
| ATC / COMMS audio | **Blocked — do not implement** | Broadcastify is **PERMISSION REQUIRED** (owner gate). LiveATC is **THIRD-PARTY BLOCKED**. No scrape, proxy, autoplay, or unauthorized audio. Do not implement audio until permission is recorded. |
| Google Photoreal / Path A | **NEEDS KEY / billing gate** | Not verified as production photoreal. No key creation or billing in this handoff. |
| OpenAI Analyst | **AO-0 scaffold hard-disabled** | AO-1 waits on an owner key and billing approval. Do not invent a key or turn paid calls on. |
| AUTH (Google / Apple / email) | **Owner-gated where incomplete** | OAuth and email credentials stay owner-gated. No fake provider buttons. Preserve owner `LOGIN_*` access. |
| DelDOT / Maryland live video | **Permission pending** | Camera embed permission is still pending for some live video sources. Do not treat held packs as approved. |
| TomTom street traffic | **Keyless must not look real** | See the simulated-traffic section below. |
| Non-3D browser re-audit | **Still recommended — unverified this pass** | SELECT → UNDERSTAND → INSPECT → ASK on `https://eartheye.us/?ee_non3d=1` for the same real object. Prior notes claimed audit-10 unit journeys passed locally; this VM did not re-run them. |
| Upstream parity / GEV delta | **Docs exist — no wholesale merge** | Matrix and reconciliation rules are in the controlling upstream spec plus [`docs/UPSTREAM_PARITY.md`](docs/UPSTREAM_PARITY.md) and [`docs/PARITY_STATUS.md`](docs/PARITY_STATUS.md). There is no `docs/UPSTREAM_DELTA_REVIEW.md` in this tree. Do not wholesale-merge God's Eye View. |
| Test suite on this cloud VM | **`TESTS_PENDING_LOCAL_RUN`** | Commands are listed below. Another worker may paste local results later. |

---

## Data-driven simulated traffic

Read together:

- Charter truthfulness: [`docs/controlling/PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md`](docs/controlling/PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md) §9 (observed vs inferred vs simulated vs estimated; never present a guess, placeholder, or generated artifact as an observation).
- Upstream roads/traffic: [`docs/controlling/UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md`](docs/controlling/UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md) §4 (roads and traffic row) and §5 (traffic and road truth rules).

Clarification for Earth Eye vs upstream God's Eye View:

- Upstream / GEV may show **simulated** or **provider-estimated** traffic, including flow coloring driven by a provider estimate, when that mode is labeled as simulated or estimated. GEV’s own description treats individual vehicle positions as not live observations.
- Earth Eye’s **production real-data default** must not present synthetic cars, particle traffic, or invented speeds as live observations.
- Keyless TomTom street traffic must **not** show simulated cars as real. Prefer **KEY REQUIRED**.
- An honest **SIMULATED** label is allowed only when that mode is explicitly allowed (a disclosed dev or illustrative path). It is not a silent fallback that looks like measured traffic.
- Road geometry is not traffic. `NO DATA`, provider failure, stale data, and “no reported incident” stay distinct. None of them is an all-clear.
- No fabricated observations. A missing source stays a missing source.

---

## Build and test

Prefer the Node engine in `package.json`: `>=24.14.0 <25 || >=26 <27`.

This cloud VM was Node **v22.14.0** with no `node_modules`, which is outside that engine. The suite was **not** run here.

**`TESTS_PENDING_LOCAL_RUN`**

Exact commands for the machine that can run them:

```bash
npm ci
npm run build
npm test
node --test src/atlas/audit10Workflow.test.mjs
npm run check:boundaries
```

`npm run check:boundaries` is present. It runs `node scripts/check-import-directions.mjs` and `node scripts/check-package-boundaries.mjs`.

Paste local results into this section when they exist. Do not treat an old “5000 passed” note as acceptance of the iPhone globe or of unfinished slices.

---

## Controlling documentation

Copied into [`docs/controlling/`](docs/controlling/) for this takeover. These files govern interpretation. They do not, by themselves, authorize code, deploys, billing, provider activation, or audio.

| Document | Role |
| --- | --- |
| [`PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md`](docs/controlling/PRODUCTION_QUALITY_AI_NATIVE_CHARTER_2026-09-29.md) | Top-level quality standard, including truthfulness |
| [`CONTROLLING_SPEC_STACK_2026-09-29.md`](docs/controlling/CONTROLLING_SPEC_STACK_2026-09-29.md) | Priority order for the stack |
| [`UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md`](docs/controlling/UPSTREAM_RECONCILIATION_ACCEPTANCE_2026-09-29.md) | Upstream pin, delta matrix, roads/traffic rules |
| [`AIRCRAFT_COCKPIT_DIRECTIVE_2026-09-29.md`](docs/controlling/AIRCRAFT_COCKPIT_DIRECTIVE_2026-09-29.md) | Cockpit is reconstructed telemetry presentation, not onboard video |
| [`AIRCRAFT_ATC_AUDIO_COMMS_DIRECTIVE_2026-09-29.md`](docs/controlling/AIRCRAFT_ATC_AUDIO_COMMS_DIRECTIVE_2026-09-29.md) | Broadcastify permission gate; LiveATC blocked; no audio until permission is recorded |
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
