# Stage 5.3 milestone — permitted history + entitlements prep + hardening

Date: 2026-09-29 ~3:20 AM CT (America/Chicago)

## 1. Users can do
- Query **permitted observation history** catalog and per-feed records via `GET /api/atlas/permitted-history` (session required on host). Empty = no retained rows yet — never invented events.
- Ask Analyst **“permitted history”** for the same catalog.
- Owner admin summary includes **server-side entitlements** (no Stripe/billing UI) and the history endpoint pointer.
- NWS weather alerts join USGS as **essential collected** feeds when Option C volume is writable.

## 2. Fixed / shipped
- `server/collection/retentionPolicy.js` — explicit retain / forbid / transient rules (Vaisala lightning, adsbdb routes, CCTV frames forbidden/transient).
- Collection scheduler refuses to schedule or apply non-retain feeds.
- History API: catalog + feed reads; 403 for forbidden with empty `records`.
- NWS CAP collection adapter + policy (public domain).
- adsbdb: **route data memory-TTL only** — never written to disk; legacy route blobs dropped on load.
- Registry: weather-lightning `store`/`export` = `no`.
- `server/entitlements/ownerEntitlements.js` — role/plan/billingStatus/featureFlags; owner always entitled; still subject to provider costs + abuse limits.
- Workspaces remain `retainsObservations: false`.

## 3. Providers verified
- Retention rules aligned with USGS/NWS/FIRMS/NHC public-domain notes and Vaisala/adsbdb/CCTV restrictions.
- No TomTom/Mapbox keys. Broadcastify HELD. LiveATC blocked.

## 4. Tests
- 29/29 Stage 5.3 + collection + stage2Policy + workspaces + incident suite (retention, history API, entitlements, adsbdb seam, collection scheduler).

## 5. Perf
- History reads are local store list (bounded limit ≤500). NWS collection interval 2 min, max 800 records, 72 h retention. adsbdb disk writes shrink (aircraft only).

## 6. Limits
- FIRMS/NHC adapters still deferred (scheduled but honest defer). Fire-perimeters retain-candidate in review queue only.
- No billing UI / no Stripe. NAV-1 not started. iPhone lag open. No push. Option C unchanged. No new spend.

## 7. Next
- Deploy this slice; continue 5.4/5.5 hardening (CSP audit notes, dependency trim) as needed.
- Wire FIRMS/NHC collection adapters when ready without inventing history.
- NAV-1 only after owner spend approval.

## 8. SHA / release / rollback
- Branch: `stage5-incident-workspaces`
- SHA: `bcad80d`
- Release: **Fly v23** live — image `registry.fly.io/eartheye:deployment-01M3P32FM14CPM8HV9N0QF1Z7G` (~3:04 AM CT). Machine check 1/1. permitted-history 401 unauth. Option C unchanged. No push.
- Rollback: Fly v22 `registry.fly.io/eartheye:deployment-01M3P2SYG9W7NVZM8FG84T9FFT`
