# WIP park — ChatGPT handoff (DO NOT MERGE / DO NOT DEPLOY)

**Status:** Unfinished work parked for ChatGPT takeover. Not production. Do not merge into known-good or `main`. Do not Fly-deploy.

## Local tip that could not be pushed as a single git history
- Local branch name: `wip/chatgpt-handoff-2026-09-29`
- Local tip SHA: `c6ef09d852db1675f501d54d8c27d1897334804d` (parent `e91d7a6…`)
- Reason push failed from agent box: GitHub HTTPS auth unavailable (`Invalid username or token` / no device for credentials).
- Reason API create_branch at `e91d7a6` failed: **object does not exist on GitHub** — local `fix/audit10-workflow` history **diverges** from `origin/fix/audit10-workflow` (remote tip ~`d78c49c` squashed checkpoint).

## What this remote WIP branch should contain
1. This README
2. Snapshot of the four dirty files committed locally in `c6ef09d` (see `wip-parked/`)
3. Pointers to other unfinished remotes:
   - `cursor/sat-celestrak-resilience-abf1` @ `596af727b718186cc4a936ae1d6847fbab0db129` (RESIL-01; PR #4; cancelled/finished — do not deploy)
   - `fix/audit10-workflow` remote (divergent squashed lineage)
   - Full atlas-eye tree remains on Grok Bot computer at `/workspace/atlas-eye` @ `c6ef09d` if owner needs a fuller pack later

## Known-good (production)
- Tag `known-good/iphone-globe-v66-b846a3e` → `b846a3e0557bc879142aef69c2babd812757a9fc`
- Fly v66 — leave alone unless owner asks
