# SOURCE_REGISTRY — COMMS providers

Reviewed: 2026-09-29 (America/Chicago). Controlling:
`COMMS_DIRECTIVE_2026-09-29.md`. Full audit: `docs/COMMS0_AUDIT.md`.

Canonical layer id for the shared UI remains `radio` (reuse
`src/layers/radio` + `control_radio`). Per-provider status below — **not** a
blanket intentional exclusion.

| id | provider | review / status | commercialUse | display | evidence |
| --- | --- | --- | --- | --- | --- |
| `comms-broadcastify` | Broadcastify Live Audio Feed Catalog / Calls APIs | `NEEDS_CREDENTIAL` / **license-review HELD** | paid Developer Program (~$2500/mo Catalog) | no | Owner HELD application 2026-09-29 (cost + competing-scanner declines). Do not email/apply. Stub returns needs-credential only. No scrape. No fake catalog. |
| `comms-openmhz` | OpenMHz | `PERMISSION_REQUIRED` | n/a | no | https://www.openmhz.com/about — API reserved for OpenMHz frontend/iOS. Held. |
| `comms-radioreference` | RadioReference Database / Live Audio | `LICENSE_REQUIRED` | license required | no | Database Web Service API — app key + per-user premium; commercial needs paid license. Held. |
| `comms-liveatc` | LiveATC.net | `BLOCKED_BY_PROVIDER_TERMS` | n/a | no | Streams may not be used in third-party products. Audio BLOCKED. |
| `comms-local-sdr` | Owner RTL-SDR / local FM | optional hardware | n/a | owner device only | `src/ui/localSdrControls.js` extension point. |
| `radio` (Radio Browser directory) | radio-browser.info | not COMMS surface (music/news) | community directory | production `/api/radio` still refused | Separate from public-safety COMMS. |

Hard exclusions unchanged: ALPR, face ID, private-person tracking, fabricated
observations, hacked/unauthorized cams, encrypted bypass, fictional contacts,
simulated traffic. LiveATC audio BLOCKED.
