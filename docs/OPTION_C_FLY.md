# Fly Option C — KEEP (Ruben confirmed 2026-09-29 CT)

App **`eartheye` only**. No further spend changes without new approval.

## Live config

| Setting | Value |
| --- | --- |
| `auto_stop_machines` | `off` |
| `min_machines_running` | `1` |
| Volume | `eartheye_data` **1 GB** dfw |
| Volume id | `vol_458pq531kp61x784` (replaces destroyed HOLD-era `vol_vz8lnzzjqxqk9w9v`) |
| Mount | `/data` → `/data/collection` |
| Env | `EE_COLLECTION_CONTINUOUS=1`, `EE_COLLECTION_DATA_DIR=/data/collection` |
| Scheduled snapshots | **true** (daily) |
| Snapshot retention | **5 days** |
| Machines | one shared-cpu-1x 512 MB; `--ha=false`; no dedicated IPv4 |

## Cost estimate (dfw)

| Item | Approx / mo |
| --- | --- |
| Always-on shared-1x @ 512 MB | ~$4.05 |
| Volume 1 GB @ $0.15/GB-mo | ~$0.15 |
| Snapshots ($0.08/GB-mo; first 10 GB free) | ~$0 until usage exceeds free tier |
| **Total** | ~**$4.20**/mo (+ snapshot overage if any) |

Redeploy does **not** erase volume data. Destroying the volume does.

## continuousClaim

True only when continuous env + writable durable dir + scheduler awake.

## Verified live (2026-09-29 ~1:28 AM CT)

- Machine `28654321fd7928` started, check passing; volume attached
- Image `registry.fly.io/eartheye:deployment-01M3NYZH0QS0VEZ6Y73ARF33Q3` (Stage 3 ship)
- `continuousClaim: true`, `durable.ready: true`, USGS ~211 records
- Snapshots: scheduled **true**, retention **5**
