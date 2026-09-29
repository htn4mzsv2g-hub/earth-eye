# COMMS-0 audit — public safety / live communications

Date: 2026-09-29 ~2:40 AM CT (America/Chicago)
Controlling: `/workspace/earth-eye-spec/COMMS_DIRECTIVE_2026-09-29.md`
Amendment: Ruben **HELD** Broadcastify application (2026-09-29) — do not email
or apply. Catalog API ~$2500/mo; they decline competing scanner apps.

Radio is **no longer** blanket `INTENTIONALLY_EXCLUDED`. COMMS surface only
(not music radio). ALPR / face ID / private-person tracking / fabricated
observations / hacked feeds / unauthorized cams / encrypted bypass / fictional
contacts / simulated traffic stay excluded. **LiveATC audio stays BLOCKED.**

## Existing radio surface (reuse, do not rewrite)

| Piece | Path | Role |
| --- | --- | --- |
| Layer factory | `src/layers/radio/` (~22 modules) | Provider-neutral catalog, clustering, playback, selection, lifecycle |
| Source | `src/layers/radio/source.js` | Directory + click reporting; audio stays with broadcaster |
| Policy | `src/layers/radio/policy.js` | Directory endpoint + UUID |
| UI | `src/ui/radio*.js` | Panel, tuner, bindings, presentation |
| Local SDR | `src/ui/localSdrControls.js`, `localSdrPresentation.js` | **Extension point for owner hardware only** |
| Server proxy | `server/providers/radio/` | Radio Browser mirrors (internet music/news directory) |
| Prod gate | `server/production/app.js` `EXCLUDED_API_PREFIXES=['/api/radio']` | Still refuses Radio Browser proxy in production until COMMS-1 + product decision |
| Voice | `control_radio` in action schemas | Reuse; keep gated until a credentialed COMMS provider exists |

Internet **Radio Browser** remains a separate music/news directory — not the
COMMS product surface. COMMS providers below attach to the same layer model.

## Provider terms re-verified → SOURCE_REGISTRY

| Provider | Registry status | Evidence (2026-09-29) | Adapter policy |
| --- | --- | --- | --- |
| **Broadcastify** | `NEEDS_CREDENTIAL` / **license-review HELD** | Catalog API Developer Program ~$2500/mo; owner held application (competing scanner apps declined). Do **not** email or apply. | Stub only → needs-credential / license-review. **No scrape. No fake catalog. No apply.** |
| **OpenMHz** | `PERMISSION_REQUIRED` (held) | About: API for OpenMHz site/iOS only; unauthorized use may crash infra. https://www.openmhz.com/about | **Held.** No client. |
| **RadioReference** | `LICENSE_REQUIRED` | API needs approved app key + per-user premium; commercial needs paid license. | **Held.** No client. |
| **LiveATC** | `BLOCKED_BY_PROVIDER_TERMS` | Streams may not be used in third-party products. | **Audio BLOCKED.** |
| **Local SDR** | Optional owner hardware | Existing `localSdr*` UI | Extension point only. |

## What COMMS-0 ships

1. This audit + `docs/SOURCE_REGISTRY_COMMS.md`.
2. Parity: radio leaves blanket `intentionally excluded`.
3. Registry: radio review off `blocked`; COMMS providers recorded; Broadcastify = NEEDS_CREDENTIAL/license-review HELD.
4. Broadcastify stub: always needs-credential (no upstream fetch, no fake rows).
5. Provider-neutral COMMS foundation module (reuse radio layer; no rewrite).
6. Production still refuses `/api/radio` (Radio Browser) and does not stream LiveATC.

## Explicitly not in COMMS-0

- Emailing or applying to Broadcastify (owner HELD).
- Fake Broadcastify catalog or scrape.
- OpenMHz / RadioReference clients.
- Any LiveATC audio path.
- Weakening ALPR / simulated traffic / fiction / unauthorized cams.
- Rewriting `src/layers/radio`.

## Next

- COMMS-1: finish provider-neutral foundation + UX honesty (credential/license-review states).
- Broadcastify remains HELD until owner revisits spend/license.
- OpenMHz/RR stay held. LiveATC stays blocked.
