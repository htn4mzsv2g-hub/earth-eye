/**
 * COMMS-0 provider-neutral registry (public safety / live communications).
 * Reuses the radio layer model; does not rewrite src/layers/radio.
 * Controlling: earth-eye-spec/COMMS_DIRECTIVE_2026-09-29.md + owner HELD Broadcastify.
 *
 * Status vocabulary:
 *   NEEDS_CREDENTIAL   — integration candidate; no key / license-review held
 *   PERMISSION_REQUIRED — held pending provider permission
 *   LICENSE_REQUIRED    — held pending paid/redistribution license
 *   BLOCKED_BY_PROVIDER_TERMS — must not integrate (e.g. LiveATC audio)
 *   LOCAL_HARDWARE      — owner device extension point only
 */

export const COMMS_PROVIDER_STATUSES = Object.freeze([
  'NEEDS_CREDENTIAL',
  'PERMISSION_REQUIRED',
  'LICENSE_REQUIRED',
  'BLOCKED_BY_PROVIDER_TERMS',
  'LOCAL_HARDWARE',
]);

/** @typedef {'NEEDS_CREDENTIAL'|'PERMISSION_REQUIRED'|'LICENSE_REQUIRED'|'BLOCKED_BY_PROVIDER_TERMS'|'LOCAL_HARDWARE'} CommsStatus */

/**
 * @type {ReadonlyArray<{
 *   id: string,
 *   name: string,
 *   status: CommsStatus,
 *   licenseReview: 'held'|'open'|'n/a',
 *   display: false,
 *   scrape: false,
 *   fakeCatalog: false,
 *   audio: 'blocked'|'credentialed'|'local'|'none',
 *   evidence: string,
 *   reviewedAt: string,
 * }>}
 */
export const COMMS_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'comms-broadcastify',
    name: 'Broadcastify',
    status: 'NEEDS_CREDENTIAL',
    licenseReview: 'held',
    display: false,
    scrape: false,
    fakeCatalog: false,
    audio: 'credentialed',
    evidence:
      'Owner HELD application 2026-09-29: Catalog API ~$2500/mo; provider declines competing scanner apps. Do not email or apply. Stub returns needs-credential / license-review only.',
    reviewedAt: '2026-09-29',
  }),
  Object.freeze({
    id: 'comms-openmhz',
    name: 'OpenMHz',
    status: 'PERMISSION_REQUIRED',
    licenseReview: 'held',
    display: false,
    scrape: false,
    fakeCatalog: false,
    audio: 'none',
    evidence:
      'openmhz.com/about: API reserved for OpenMHz website/iOS; unauthorized use discouraged. Held.',
    reviewedAt: '2026-09-29',
  }),
  Object.freeze({
    id: 'comms-radioreference',
    name: 'RadioReference',
    status: 'LICENSE_REQUIRED',
    licenseReview: 'held',
    display: false,
    scrape: false,
    fakeCatalog: false,
    audio: 'none',
    evidence:
      'RadioReference Database Web Service requires approved app key + per-user premium; commercial/redistribution needs paid license. Held.',
    reviewedAt: '2026-09-29',
  }),
  Object.freeze({
    id: 'comms-liveatc',
    name: 'LiveATC',
    status: 'BLOCKED_BY_PROVIDER_TERMS',
    licenseReview: 'n/a',
    display: false,
    scrape: false,
    fakeCatalog: false,
    audio: 'blocked',
    evidence:
      'LiveATC FAQ/legal: audio streams may not be used in third-party products; no dedicated app or automated retrieval without consent. Audio BLOCKED.',
    reviewedAt: '2026-09-29',
  }),
  Object.freeze({
    id: 'comms-local-sdr',
    name: 'Local SDR',
    status: 'LOCAL_HARDWARE',
    licenseReview: 'n/a',
    display: false,
    scrape: false,
    fakeCatalog: false,
    audio: 'local',
    evidence:
      'Owner RTL-SDR / local FM via src/ui/localSdrControls.js — extension point only; no remote catalog.',
    reviewedAt: '2026-09-29',
  }),
]);

export const COMMS_PROVIDERS_BY_ID = Object.freeze(
  Object.fromEntries(COMMS_PROVIDERS.map((p) => [p.id, p])),
);

/** Layer id that owns the shared UI / voice surface (reuse, do not rewrite). */
export const COMMS_LAYER_ID = 'radio';

/** Hard product exclusions that COMMS must never weaken. */
export const COMMS_HARD_EXCLUSIONS = Object.freeze([
  'alpr-cameras',
  'traffic',
  'face-identification',
  'private-person-tracking',
  'fabricated-observations',
  'hacked-feeds',
  'unauthorized-cameras',
  'encrypted-bypass',
  'fictional-contacts',
  'simulated-traffic',
  'liveatc-audio',
]);

/** True when a COMMS provider may not be displayed or fetched yet. */
export function commsProviderHeld(provider) {
  if (!provider) return true;
  if (provider.display) return false;
  return (
    provider.status === 'NEEDS_CREDENTIAL' ||
    provider.status === 'PERMISSION_REQUIRED' ||
    provider.status === 'LICENSE_REQUIRED' ||
    provider.status === 'BLOCKED_BY_PROVIDER_TERMS' ||
    provider.licenseReview === 'held'
  );
}

/** LiveATC (and any BLOCKED audio) must never get a stream path. */
export function commsAudioBlocked(provider) {
  return (
    !provider ||
    provider.audio === 'blocked' ||
    provider.status === 'BLOCKED_BY_PROVIDER_TERMS'
  );
}

/**
 * Broadcastify (and any NEEDS_CREDENTIAL provider) response shape for stubs.
 * Never invent feeds.
 */
export function commsNeedsCredentialPayload(providerId = 'comms-broadcastify') {
  const p = COMMS_PROVIDERS_BY_ID[providerId];
  return Object.freeze({
    ok: false,
    code: 'NEEDS_CREDENTIAL',
    licenseReview: p?.licenseReview || 'held',
    provider: p?.name || providerId,
    providerId,
    feeds: Object.freeze([]),
    error:
      p?.evidence ||
      'Credential / license review required. No catalog is served.',
  });
}
