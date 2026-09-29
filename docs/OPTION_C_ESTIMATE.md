# Option C — FINAL CONFIG + COST ESTIMATE (not approved)

**Status: HOLD.** Ruben requested estimate only. Do **not** create a volume,
flip always-on, or change Fly billing until he explicitly approves this page.

App: **`eartheye` only**. Still `--ha=false`, one machine, no dedicated IPv4.

## Proposed config (not applied)

| Setting | Proposed value |
| --- | --- |
| `auto_stop_machines` | `off` |
| `min_machines_running` | `1` |
| Volume name | `eartheye_data` |
| Volume size | **1 GB** (smallest that fits Stage 2/3 checkpoints + permitted observation history for reviewed feeds; USGS ~≤500 records/feed + health JSON ≪ 1 GB) |
| Volume region | `dfw` (same as machine) |
| Mount | `/data` → `EE_COLLECTION_DATA_DIR=/data/collection` |
| Env | `EE_COLLECTION_CONTINUOUS=1` |
| Machines | one `shared-cpu-1x` 512 MB |
| Snapshots | recommend **off** initially (or accept first 10 GB snapshot free) |

## Cost estimate (dfw)

Pricing from [Fly.io Resource Pricing](https://docs.fly.io/about/pricing/)
(`shared` CPU \$0.00000075/vCPU-s, RAM \$0.00000193/GB-s; **dfw markup ×1.25**;
volumes \$0.15/GB-mo).

| Item | Approx monthly (730 h) |
| --- | --- |
| Always-on shared-1x @ 512 MB (1 vCPU shared + 256 MB above base 256 MB, ×1.25) | ~**\$4.05** |
| Volume 1 GB @ \$0.15/GB-mo | ~**\$0.15** |
| **Total** | ~**\$4.20**/mo |

Notes:
- Redeploy alone does **not** erase volume data; destroying the volume does.
- Option A (current): ~\$0 when idle; pay only while awake; collection not 24/7.
- Code already supports durable checkpoints when `EE_COLLECTION_DATA_DIR` is set;
  `continuousClaim` stays **false** until continuous env + writable durable dir
  are both live on an always-on machine.

## Rollback plan (if later approved then reversed)

1. Restore `auto_stop_machines=stop`, `min_machines_running=0`, remove mounts + continuous env; deploy `--ha=false`.
2. Optionally destroy volume (irreversible history loss).
3. Known-good pre-Option-C image: v8 `registry.fly.io/eartheye:deployment-01M3NP74GRYB7T6M59TY3R9PA2` or later Option-A image after this hold.

## Accidental apply note (2026-09-29)

A prior steering message briefly applied Option C (volume `vol_vz8lnzzjqxqk9w9v`,
always-on). That is being **reverted to Option A** and the volume **destroyed**
under this HOLD. Re-apply only after Ruben approves this estimate.


## Applied (2026-09-29)
Scheduled snapshots **enabled**, retention **5 days** on `vol_vz8lnzzjqxqk9w9v`.
