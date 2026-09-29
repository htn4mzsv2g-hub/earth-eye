# Known-good rollback — Fly v66 (iPhone globe)

**Status:** Owner confirmed physical iPhone drag + pinch WORK (2026-09-29 ~9:32 AM CT). P0 freeze CLOSED.

| Field | Value |
|-------|--------|
| Fly release | **v66** |
| Image | `registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z` |
| Digest | `sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824` |
| BUILD_ID | `git-b846a3e-202609290929` |
| Git SHA | `b846a3e0557bc879142aef69c2babd812757a9fc` |
| Branch | `cursor/restore-preaudit-globe-444e` (PR #3) |

## Rollback (no rebuild)

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z
```

## What fixed the freeze (for history)

1. Loader hard-release / detach if stamp present but still hit-testable (`3831c06`, Fly v65).
2. Detection canvas pass-through under mobile `#cesiumContainer canvas { pointer-events: auto !important }` (`b846a3e`, Fly v66).

Preserve this tip before further product changes.
