/**
 * Detect Apple / Google / email provider configuration from the environment.
 * Never invents secrets — returns readiness + missing names for honest UI.
 *
 * Maps / Places keys are NOT Sign-In credentials.
 */

import { cleanEnvSecret } from './session-auth.js';

const nonEmpty = (value) => Boolean(cleanEnvSecret(value));

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   apple: { configured: boolean, missing: string[] },
 *   google: { configured: boolean, missing: string[] },
 *   email: { configured: boolean, missing: string[] },
 * }}
 */
export function resolveAuthProviders(env = process.env) {
  const appleKeys = [
    'APPLE_CLIENT_ID',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
  ];
  const googleKeys = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'];
  const emailKeys = ['EMAIL_API_KEY', 'EMAIL_FROM'];

  const missingOf = (keys) => keys.filter((key) => !nonEmpty(env[key]));

  const appleMissing = missingOf(appleKeys);
  const googleMissing = missingOf(googleKeys);
  // Email: need a from-address plus either EMAIL_API_KEY or SMTP_URL.
  const emailMissing = [];
  if (!nonEmpty(env.EMAIL_FROM)) emailMissing.push('EMAIL_FROM');
  if (!nonEmpty(env.EMAIL_API_KEY) && !nonEmpty(env.SMTP_URL))
    emailMissing.push('EMAIL_API_KEY|SMTP_URL');

  return Object.freeze({
    apple: Object.freeze({
      configured: appleMissing.length === 0,
      missing: Object.freeze(appleMissing),
    }),
    google: Object.freeze({
      configured: googleMissing.length === 0,
      missing: Object.freeze(googleMissing),
    }),
    email: Object.freeze({
      configured: emailMissing.length === 0,
      missing: Object.freeze(emailMissing),
    }),
  });
}

/** Exact redirect / return URLs operators must register for eartheye.us. */
export const EARTH_EYE_OAUTH_CHECKLIST = Object.freeze({
  hosts: Object.freeze(['https://eartheye.us', 'https://www.eartheye.us']),
  appleReturnUrls: Object.freeze([
    'https://eartheye.us/auth/apple/callback',
    'https://www.eartheye.us/auth/apple/callback',
  ]),
  googleRedirectUris: Object.freeze([
    'https://eartheye.us/auth/google/callback',
    'https://www.eartheye.us/auth/google/callback',
  ]),
  appleSecrets: Object.freeze([
    'APPLE_CLIENT_ID',
    'APPLE_TEAM_ID',
    'APPLE_KEY_ID',
    'APPLE_PRIVATE_KEY',
  ]),
  googleSecrets: Object.freeze([
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
  ]),
  emailSecrets: Object.freeze(['EMAIL_FROM', 'EMAIL_API_KEY or SMTP_URL']),
});
