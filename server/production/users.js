import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Account sources for the production sign-in.
 *
 * AUTH-1 keeps the env-admin owner path as the permanent break-glass account.
 * Optional REVIEWER_USER / REVIEWER_PASS adds a second env account for
 * temporary critique access (ChatGPT / human reviewer) without sharing
 * LOGIN_PASS. Registration stays closed (private beta).
 *
 * UserStore:
 *   authenticate(identifier, password) → { id, displayName, role } | null
 *     Constant-time; the same null for an unknown user and a wrong password.
 *   credentialVersion(id) → string | null
 *     Changes whenever that account's credentials change; sessions minted
 *     under an older version stop verifying. null = account gone.
 *   roleOf(id) → string | null
 *     Role for a known account id, or null when the store does not own it.
 *
 * Registration:
 *   open: boolean
 *   register(fields) → { ok: false, message } (always closed in private beta;
 *     fields are never read or stored).
 */

export const PRIVATE_BETA_CLOSED = 'Private beta is currently closed.';
export const OWNER_ROLE = 'owner';
export const REVIEWER_ROLE = 'reviewer';

/** Constant-time string comparison: hash both sides (equal lengths), then timingSafeEqual. */
export function safeEqual(a, b) {
  const digest = (value) => createHash('sha256').update(String(value)).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * The single owner account from LOGIN_USER / LOGIN_PASS. The identifier is
 * compared exactly (case-sensitive, untrimmed): whatever is typed must match.
 *
 * @param {{user: string, pass: string}} credentials
 */
export function createEnvAdminStore({ user, pass }) {
  const owner = Object.freeze({
    id: 'admin',
    displayName: 'Owner',
    role: OWNER_ROLE,
  });
  const version = createHash('sha256')
    .update(`admin\0${user}\0${pass}`)
    .digest('base64url');
  return {
    authenticate(identifier, password) {
      // Both comparisons always run so timing reveals nothing about which failed.
      const userOk = safeEqual(String(identifier ?? ''), user);
      const passOk = safeEqual(String(password ?? ''), pass);
      return userOk && passOk ? owner : null;
    },
    credentialVersion(id) {
      return id === owner.id ? version : null;
    },
    roleOf(id) {
      return id === owner.id ? OWNER_ROLE : null;
    },
  };
}

/**
 * Optional reviewer account from REVIEWER_USER / REVIEWER_PASS. Same
 * constant-time authenticate + credentialVersion pattern as the owner store.
 * Id is always `reviewer` (distinct from owner `admin`).
 *
 * @param {{user: string, pass: string}} credentials
 */
export function createEnvReviewerStore({ user, pass }) {
  const reviewer = Object.freeze({
    id: 'reviewer',
    displayName: 'Reviewer',
    role: REVIEWER_ROLE,
  });
  const version = createHash('sha256')
    .update(`reviewer\0${user}\0${pass}`)
    .digest('base64url');
  return {
    authenticate(identifier, password) {
      const userOk = safeEqual(String(identifier ?? ''), user);
      const passOk = safeEqual(String(password ?? ''), pass);
      return userOk && passOk ? reviewer : null;
    },
    credentialVersion(id) {
      return id === reviewer.id ? version : null;
    },
    roleOf(id) {
      return id === reviewer.id ? REVIEWER_ROLE : null;
    },
  };
}

/**
 * Try each store in order. authenticate always runs every store (no
 * short-circuit on identifier alone) so timing does not trivially leak which
 * account exists; the first successful match wins (owner-first when wired
 * that way). credentialVersion / roleOf return from the store that owns the id.
 *
 * @param {object[]} stores
 */
export function createCompositeUserStore(stores) {
  const list = Array.isArray(stores) ? stores.filter(Boolean) : [];
  if (list.length === 0) throw new Error('createCompositeUserStore requires at least one store');
  if (list.length === 1) return list[0];
  return {
    authenticate(identifier, password) {
      let match = null;
      for (const store of list) {
        const result = store.authenticate(identifier, password);
        if (result && !match) match = result;
      }
      return match;
    },
    credentialVersion(id) {
      for (const store of list) {
        const version = store.credentialVersion(id);
        if (version != null) return version;
      }
      return null;
    },
    roleOf(id) {
      for (const store of list) {
        const role = store.roleOf?.(id);
        if (role != null) return role;
      }
      return null;
    },
  };
}

/** Private beta: nobody can sign up. Submitted fields are ignored, never stored. */
export function createClosedRegistration() {
  return Object.freeze({
    open: false,
    register() {
      return { ok: false, message: PRIVATE_BETA_CLOSED };
    },
  });
}

/**
 * Account authority: env-admin owner first (never lock out), optional extra
 * stores later. Registration remains closed until AUTH invite work ships.
 *
 * @param {{ userStore: object, registration?: object }} options
 */
export function createAccountAuthority({
  userStore,
  registration = createClosedRegistration(),
}) {
  if (!userStore) throw new Error('userStore required');
  return Object.freeze({
    userStore,
    registration,
    authenticate(identifier, password) {
      return userStore.authenticate(identifier, password);
    },
    credentialVersion(id) {
      return userStore.credentialVersion(id);
    },
    roleOf(id) {
      return userStore.roleOf?.(id) ?? null;
    },
  });
}
