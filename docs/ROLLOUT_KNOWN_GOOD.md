# Known-good rollback — iPhone globe Fly v66

**Recorded:** 2026-09-29 ~9:34 AM CT (America/Chicago)  
**Owner:** Ruben, confirmed on a physical iPhone (drag and pinch).  
**Control plane:** Chief of Staff, 2026-09-29 ~9:51 AM CT. No redeploy was performed.  
**This file is the rollback point.** Development is paused. Do not redeploy casually, and do not redeploy Fly to “save” this record. The image below is already the working release. Takeover document: [`../HANDOFF.md`](../HANDOFF.md).

```text
FINAL HANDOFF — verify before further changes. Do not redeploy Fly.

1. Branch name: cursor/restore-preaudit-globe-444e
2. Tag name: known-good/iphone-globe-v66-b846a3e
3. Full commit SHA: b846a3e0557bc879142aef69c2babd812757a9fc
4. Rollback command (agent box, no rebuild):
   HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN fly deploy -a eartheye --ha=false --image registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z

Fly release: v66
BUILD_ID: git-b846a3e-202609290929
Image: registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z
Image digest: sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824
Machine: 28654321fd7928 (proud-water-4069), dfw, started, health check passing
```

## Identity

| Item | Value |
| --- | --- |
| Fly app | `eartheye` |
| Fly release | **v66** |
| Image | `registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z` |
| Digest | `sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824` |
| BUILD_ID | `git-b846a3e-202609290929` |
| Git SHA | `b846a3e0557bc879142aef69c2babd812757a9fc` |
| Branch | `cursor/restore-preaudit-globe-444e` |
| Pull request | https://github.com/htn4mzsv2g-hub/earth-eye/pull/3 |
| Tag | `known-good/iphone-globe-v66-b846a3e` (lightweight, points at that SHA) |
| Machine | `28654321fd7928` (`proud-water-4069`) |
| Region / state | `dfw` / `started`, health check passing |
| Guest | shared-cpu-1x, 512MB |
| Volume | `eartheye_data` 1GB at `/data`; autostop false; min machines 1 |
| Pass | Physical iPhone drag and pinch |

The tag is the product code that built this image. Docs added after `b846a3e` do not change that behavior. Check out the tag, not a later tip, when you need the exact known-good tree.

## Rollback

Use the agent-box command in the final-handoff block above. Do not redeploy casually. Run it only after a later deploy is bad:

```bash
HOME=/home/box env -u FLY_API_TOKEN -u FLY_ACCESS_TOKEN \
  fly deploy -a eartheye --ha=false \
  --image registry.fly.io/eartheye:deployment-01M3PS536PEVZP5SDRP6K3CC7Z
```

That image is digest `sha256:b0ce45ef7a4386b850238fbc8161c3618bb8822891cf363d70c5ee7987618824`. Commits on the restore branch after `b846a3e` are docs-only and do not change this image. Matching source:

```bash
git checkout known-good/iphone-globe-v66-b846a3e
```

Do not roll the globe back to v57, v62, v64, or v65. v65 still swallowed the touch on `canvas#world-overlay-detection-surface`. Mapping: `docs/IPHONE_GLOBE_RELEASE_MAP.md`.
