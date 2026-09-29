# Omissions — remote WIP vs local atlas-eye @ c6ef09d

This branch parks a **file snapshot** of unfinished local work. It is not a faithful git clone of atlas-eye at `c6ef09d852db1675f501d54d8c27d1897334804d`.

Compared with that local tip, the following are **not** in this remote WIP:

- **Full divergent git history / remaining tree.** The local parent `e91d7a6` is not on GitHub, and the remaining ~89-file tree versus known-good `b846a3e` was **not** uploaded. This park contains only the four dirty snapshot files (plus this README, the known-good test log, and this omissions note):
  - `snapshot-from-local-c6ef09d/HANDOFF.md`
  - `snapshot-from-local-c6ef09d/docs/EE_IPHONE_GLOBE_FREEZE_REGRESSION_2026-09-29.md`
  - `snapshot-from-local-c6ef09d/docs/UPSTREAM_DELTA_REVIEW.md`
  - `snapshot-from-local-c6ef09d/scripts/ee-iphone-globe-probe.mjs`
- **`node_modules`, `.env`, and secrets** were never included.
- **RESIL work** lives on a separate branch, `cursor/sat-celestrak-resilience-abf1` @ `596af727b718186cc4a936ae1d6847fbab0db129` (RESIL-01). It is not part of this snapshot.

Do not treat this branch as production. Do not merge it into `main` or `known-good`. Do not Fly-deploy it.
