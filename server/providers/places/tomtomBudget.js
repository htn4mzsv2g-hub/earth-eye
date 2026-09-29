/**
 * TomTom free-tier hard budget governor (owner-approved Orbis free caps).
 * Routing 20K/mo · tiles 200K/mo · incident-details 2.5K/mo.
 * Fail honestly near/over cap — never invent LIVE when over budget.
 */
import fs from 'node:fs';
import path from 'node:path';

export const TOMTOM_FREE_CAPS = Object.freeze({
  routing: 20_000,
  tiles: 200_000,
  incidentDetails: 2_500,
});

/** Soft stop when this fraction of the monthly cap is reached. */
export const TOMTOM_BUDGET_SOFT_RATIO = 0.95;

export function utcMonthKey(epochMs = Date.now()) {
  return new Date(epochMs).toISOString().slice(0, 7); // YYYY-MM
}

export function defaultBudgetPath(cwd = process.cwd()) {
  return path.join(cwd, '.gev-cache', 'tomtom', 'monthly-budget.json');
}

/**
 * @param {object|null} state
 * @param {string} monthKey
 */
export function normalizeMonthlyBudget(state, monthKey) {
  const valid =
    Boolean(state) &&
    state.month === monthKey &&
    typeof state.counts === 'object' &&
    state.counts;
  if (!valid) {
    return {
      month: monthKey,
      counts: { routing: 0, tiles: 0, incidentDetails: 0 },
    };
  }
  return {
    month: monthKey,
    counts: {
      routing: Math.max(0, Number(state.counts.routing) || 0),
      tiles: Math.max(0, Number(state.counts.tiles) || 0),
      incidentDetails: Math.max(0, Number(state.counts.incidentDetails) || 0),
    },
  };
}

export function capFor(category, env = process.env) {
  if (category === 'routing') {
    const n = Number.parseInt(env.TOMTOM_MONTHLY_ROUTING_BUDGET || '', 10);
    return Number.isFinite(n) && n > 0 ? n : TOMTOM_FREE_CAPS.routing;
  }
  if (category === 'tiles') {
    const n = Number.parseInt(env.TOMTOM_MONTHLY_TILE_BUDGET || '', 10);
    return Number.isFinite(n) && n > 0 ? n : TOMTOM_FREE_CAPS.tiles;
  }
  if (category === 'incidentDetails') {
    const n = Number.parseInt(env.TOMTOM_MONTHLY_INCIDENT_BUDGET || '', 10);
    return Number.isFinite(n) && n > 0 ? n : TOMTOM_FREE_CAPS.incidentDetails;
  }
  return 0;
}

export function budgetStatus(state, category, env = process.env) {
  const cap = capFor(category, env);
  const used = state?.counts?.[category] || 0;
  const soft = Math.floor(cap * TOMTOM_BUDGET_SOFT_RATIO);
  return {
    category,
    month: state?.month || null,
    used,
    cap,
    remaining: Math.max(0, cap - used),
    softCap: soft,
    nearCap: used >= soft,
    overCap: used >= cap,
  };
}

/**
 * In-memory + disk monthly budget. Cache hits must NOT call record().
 */
export function createTomTomMonthlyBudget({
  filePath = defaultBudgetPath(),
  now = () => Date.now(),
  env = process.env,
} = {}) {
  let state = null;
  let loaded = false;
  let dirty = false;

  function ensure() {
    const month = utcMonthKey(now());
    if (!loaded) {
      loaded = true;
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        state = normalizeMonthlyBudget(raw, month);
      } catch {
        state = normalizeMonthlyBudget(null, month);
      }
    } else {
      state = normalizeMonthlyBudget(state, month);
    }
    return state;
  }

  function persist() {
    if (!dirty) return;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(ensure()));
      fs.renameSync(tmp, filePath);
      dirty = false;
    } catch {
      /* retry next write */
    }
  }

  return {
    status(category) {
      return budgetStatus(ensure(), category, env);
    },
    snapshot() {
      const s = ensure();
      return {
        month: s.month,
        routing: budgetStatus(s, 'routing', env),
        tiles: budgetStatus(s, 'tiles', env),
        incidentDetails: budgetStatus(s, 'incidentDetails', env),
      };
    },
    /** @returns {{ok:true}|{ok:false,error:string,status:object}} */
    admit(category) {
      const st = budgetStatus(ensure(), category, env);
      if (st.overCap) {
        return {
          ok: false,
          error: 'tomtom_budget',
          status: st,
          note: `TomTom free-tier ${category} monthly cap reached (${st.used}/${st.cap}).`,
        };
      }
      if (st.nearCap) {
        return {
          ok: true,
          warn: 'near_cap',
          status: st,
          note: `Near TomTom free-tier ${category} cap (${st.used}/${st.cap}).`,
        };
      }
      return { ok: true, status: st };
    },
    record(category, n = 1) {
      const s = ensure();
      s.counts[category] = (s.counts[category] || 0) + Math.max(0, n);
      dirty = true;
      persist();
      return budgetStatus(s, category, env);
    },
    /** Test helper */
    _resetForTest() {
      state = null;
      loaded = false;
      dirty = false;
    },
  };
}
