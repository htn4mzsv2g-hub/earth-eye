# ARCHIVE ONLY — DO NOT MERGE / DO NOT DEPLOY

This directory is a non-deployable archival upload. It preserves the local tip versus known-good so the delta can be reviewed. It is not a release candidate.

- **DO NOT MERGE** this branch into `main` or known-good.
- **DO NOT DEPLOY** to Fly or any other target from this archive.
- **DO NOT** move tags or overwrite known-good.

## Unchanged production

Fly **v66** and known-good `b846a3e0557bc879142aef69c2babd812757a9fc` (tag `known-good/iphone-globe-v66-b846a3e`) are unchanged. This upload does not deploy, retag, or merge them.

## Separate unfinished work

RESIL branch `cursor/sat-celestrak-resilience-abf1` @ `596af727b718186cc4a936ae1d6847fbab0db129` (PR #4) is separate unfinished work. This archive does not include or alter it.

## What is here

| Path | What |
|------|------|
| `c6ef09d-vs-b846a3e.tar.gz` | Original upload tarball |
| `c6ef09d-vs-b846a3e.tar.gz.sha256` | Sidecar. sha256 `f48f24298fe503ddcb2f818c670e2bff17ac341c7720522759a28ccf13571cbf` |
| `c6ef09d-vs-b846a3e-2026-09-29/` | Unpacked, browsable tree: README, MANIFEST, OMISSIONS, DELETIONS, diffstat, `files/`, `patches/`, `meta/` |

The unpacked `c6ef09d-vs-b846a3e-2026-09-29/README.md` records the divergent histories (`c6ef09d` vs `b846a3e`) and repeats the do-not-merge / do-not-deploy warning. `OMISSIONS.md` lists what the archive itself left out (secrets, dependency and build outputs, and large media).
