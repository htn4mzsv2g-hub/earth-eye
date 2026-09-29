# Rollback — Google Photoreal prep

Recorded before / with the Photoreal prep deploy (Google still OFF).

| Item | Value |
|------|-------|
| Git tip (pre-prep parent) | `d633842` — Esri sharpness Fly v40 docs |
| Fly image to restore keyless Esri tip | **v40** `registry.fly.io/eartheye:deployment-01M3P79G8X52WGH2JNRMNHAFJW` |
| Branch | `stage5-incident-workspaces` |

## Roll Fly image back
```bash
fly deploy -a eartheye --ha=false --image registry.fly.io/eartheye:deployment-01M3P79G8X52WGH2JNRMNHAFJW
```

## Roll git working tree (local only — no push)
```bash
git checkout d633842 -- src/maps/google3d.js src/app/scene.js # or full reset if intentional
```

If a later deploy accidentally baked Google/ion **build** secrets and owner wants Google OFF again, redeploy **without** `--build-secret GOOGLE_MAPS_API_KEY` / `CESIUM_ION_TOKEN` so Vite inlines empty keys.

## Post-prep tip (this ship)
- Git: `9630c1e`
- Fly: **v41** `deployment-01M3P7H3W5449CGHRAQ6GZ0KEZ` (Photoreal still OFF)
