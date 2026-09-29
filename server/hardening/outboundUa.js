/**
 * Shared outbound User-Agent / contact for provider fetches (Stage 5.5).
 * OSM/NWS/etc. ask for a valid UA identifying the app + contact.
 */
export const EE_CONTACT_URL = 'https://eartheye.us';

export function earthEyeUserAgent(component = 'proxy') {
  const safe = String(component || 'proxy')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .slice(0, 40);
  return `earth-eye-${safe}/1.0 (private hosted instance; +${EE_CONTACT_URL})`;
}
