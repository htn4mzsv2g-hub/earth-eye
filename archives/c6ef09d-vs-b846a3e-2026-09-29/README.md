# ARCHIVE ONLY — DO NOT MERGE / DO NOT DEPLOY

**Status:** Non-deployable archival snapshot of remaining differences.  
**Created:** 2026-09-29 (America/Chicago)  
**Purpose:** Preserve local tip work vs known-good for review / ChatGPT takeover. Not a release candidate.

## Critical warnings

- **DO NOT MERGE** this content into `main` or known-good.
- **DO NOT DEPLOY** to Fly or any production/staging target from this archive.
- **DO NOT** move tags, force-push, or overwrite known-good.
- This archive is for comparison and recovery of unfinished local work only.
- A separate CloudAgent may upload these files to GitHub branch  
  `wip/archive-c6ef09d-vs-b846a3e-2026-09-29` — that branch is also **WIP / archival only**.

## Commits

| Role | SHA | Notes |
|------|-----|-------|
| **Local tip** (atlas-eye) | `c6ef09d852db1675f501d54d8c27d1897334804d` | `wip/chatgpt-handoff-2026-09-29` — unfinished work parked for ChatGPT |
| **Tip parent** | `e91d7a6ea9ca49b65f9f19f0bbed08024b0760c3` | **Not on GitHub** (no remote ref contains this SHA at archive time) |
| **Known-good** | `b846a3e0557bc879142aef69c2babd812757a9fc` | Fly **v66** iPhone-globe confirmed; branch `cursor/restore-preaudit-globe-444e` (PR #3) |

Known-good details: see `/workspace/earth-eye-spec/KNOWN_GOOD_FLY_V66_2026-09-29.md`.

## Histories

`git merge-base b846a3e c6ef09d` is **empty** — histories are **divergent**.  
Neither commit is an ancestor of the other (~115 tip-only commits vs ~7 known-good-only).  
Tree-level `git diff` and blob-SHA file compare are both included (`diffstat.txt`, `meta/checksum-compare.txt`).

## RESIL (recorded, not part of this delta)

| Field | Value |
|-------|--------|
| Branch | `cursor/sat-celestrak-resilience-abf1` |
| SHA | `596af727b718186cc4a936ae1d6847fbab0db129` |
| PR | #4 |

RESIL is noted for continuity; this archive compares tip↔known-good only and does not alter RESIL, assertions, or tests.

## Contents

| Path | Description |
|------|-------------|
| `patches/c6ef09d-vs-b846a3e.unified.patch` | Unified diff tip←known-good (excludes large media + handoff screenshots) |
| `patches/c6ef09d-vs-b846a3e.text.patch` | Same scope (text-oriented) |
| `files/` | Tip versions of added/modified non-omitted paths |
| `DELETIONS.txt` | Paths present in known-good, absent at tip |
| `diffstat.txt` | Diffstat + divergence notes + checksum summary |
| `MANIFEST.txt` | Every included archive file: path, size, sha256 |
| `OMISSIONS.md` | Everything excluded and why |
| `meta/` | name-status, checksum-compare, omitted-media inventory |

## Working tree note

At archive time both `/workspace/atlas-eye` (at `c6ef09d`) and `/workspace/earth-eye-restore` (at `b846a3e`) were **clean** — no extra dirty/untracked product source beyond the tip commit itself (handoff docs/scripts are inside `c6ef09d`).

## Assertions / tests

**No assertions or tests were changed** by this archival task. Test files that already differ between the two tips appear in the patch as historical delta only.
