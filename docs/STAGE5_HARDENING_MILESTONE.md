# Stage 5.4/5.5 milestone — owner entitlements + audit log + hardening polish

Date: 2026-09-29 ~3:25 AM CT (America/Chicago)

## 1. Users can do
- Read expanded `GET /api/atlas/owner-summary` (session): entitlements with **billingUi/stripe/adminUiExposed=false**, permission review date, COMMS holds, NAV-2 status, hardening invariants.
- Read `GET /api/atlas/audit-log` (newest first, secrets redacted) and `GET /api/atlas/csp-audit`.
- Sign-in success/fail/rate-limit and workspace save/delete append to the owner audit log (no passwords).

## 2. Fixed / shipped
- `server/entitlements/auditLog.js` + rotation bound; redaction for secret-shaped keys.
- Entitlements: owner always entitled; `adminUiExposed: false`; no Stripe/billing UI flags.
- CSP audit snapshot + invariants; shared outbound UA/contact helper.
- Login + workspace actions audited. Broadcastify HELD / LiveATC blocked unchanged. Mapbox not wired.

## 3. Providers verified
- No new billable providers or keys. No TomTom account created. Audit/CSP are local facts.

## 4. Tests
- Entitlements, auditLog, cspAudit, retention, routeProvider, stage2Policy suites green.

## 5. Perf
- Audit append is sync JSONL (bounded rotate at 2 MB). CSP audit is pure CPU.

## 6. Limits
- iPhone lag open. No push. Option C unchanged. No new spend. Hosted POWER UP still env/fly-secrets only.
- Full globe CSP allowlist for Cesium tiles remains a documented gap (authenticated SPA).

## 7. Next
- Deploy this slice. Owner still installs `TOMTOM_API_KEY` separately when ready.
- Further 5.5 dependency trim / matrix QA as needed.

## 8. SHA / release / rollback
- Branch: `stage5-incident-workspaces`
- SHA: `e0886f4`
- Release: **Fly v25** live — image `registry.fly.io/eartheye:deployment-01M3P3E6VJDYQJF017QPQWGGDA` (~3:20 AM CT). Verified healthz 200; owner-summary/audit-log/csp-audit/history/route-status 401; signup 403. Option C unchanged. No push. No TomTom key invented.
- Rollback: Fly v24 `registry.fly.io/eartheye:deployment-01M3P391YT9CAX56QSBD8JTY9D`
