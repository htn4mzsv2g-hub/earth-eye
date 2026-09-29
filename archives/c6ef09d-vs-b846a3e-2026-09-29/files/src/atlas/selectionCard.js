/**
 * Mobile object card — contextual actions by selected type (UX-2).
 * SELECT vs FOLLOW, STALE cue, Cockpit with honest reason, PREV/NEXT when cockpit.
 * World Events: Follow is UNAVAILABLE (honesty — no retention/notify).
 */
import {
  EVENT_FOLLOW_CONTROL_LABEL,
  EVENT_FOLLOW_SELECT_NOTE,
  eventFollowAvailability,
} from '../events/live/followAvailability.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

function layerKind(layerId) {
  const id = String(layerId || '');
  if (id === 'flights' || id === 'local-adsb') return 'air';
  if (id === 'military') return 'mil';
  if (id === 'ais-live-vessels') return 'sea';
  if (id === 'satellites' || id === 'rocket-launches') return 'space';
  if (id === 'cctv') return 'camera';
  if (id === 'earthquakes') return 'quake';
  if (id === 'local-firms') return 'fire';
  if (id === 'weather-alerts' || id === 'nws-alerts') return 'alert';
  if (id === 'traffic') return 'road';
  if (id === 'fire-perimeters') return 'fire';
  if (id === 'world-events') return 'world-event';
  return 'other';
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root
 * @param {(name:string,args?:object)=>Promise<any>} o.runAction
 * @param {(html:string,tone?:string)=>void} o.say
 * @param {() => object|null} [o.getFlightsTracked] - getTrackedInfo from flights layer
 * @param {AbortSignal} [o.signal]
 */
export function initSelectionCard({
  root,
  runAction,
  say,
  getFlightsTracked = () => null,
  getCockpitState = () => null,
  openWorldEventDetail = null,
  signal,
}) {
  const card = document.createElement('aside');
  card.id = 'ee-selection-card';
  card.hidden = true;
  card.setAttribute('aria-live', 'polite');
  root.appendChild(card);

  let subject = null; // { layerId, id, label, following, stale }
  let poll = 0;

  function cockpitReason() {
    if (
      document.documentElement?.classList?.contains('ee-graphics-failed')
    )
      return 'UNAVAILABLE — 3D renderer down (Cockpit needs the globe)';
    const st = getCockpitState?.();
    if (!st) return 'Cockpit status unavailable';
    if (st.active) return null;
    if (st.entryAllowed) return null;
    const r = st.entryBlockedReason;
    if (r === 'no-tracked-aircraft')
      return 'FOLLOW an aircraft first, then open Cockpit';
    if (r === 'contacts-inactive')
      return 'Open Contacts context before Cockpit';
    if (r === 'contacts-starting') return 'Contacts still starting — try again';
    return r || 'Cockpit unavailable';
  }

  function render() {
    if (!subject) {
      card.hidden = true;
      card.innerHTML = '';
      return;
    }
    const kind = layerKind(subject.layerId);
    // World Events: SELECT ≠ FOLLOW — never show FOLLOW badge without a real mechanism.
    const following =
      kind === 'world-event' ? false : Boolean(subject.following);
    const stale = kind === 'world-event' ? false : Boolean(subject.stale);
    const cock = getCockpitState?.() || {};
    const inCockpit = Boolean(cock.active);
    const block = cockpitReason();
    const actions = [];

    if (kind === 'air' || kind === 'mil') {
      if (!following)
        actions.push(
          `<button type="button" data-ee-sel="follow">FOLLOW</button>`,
        );
      else
        actions.push(
          `<button type="button" data-ee-sel="stop">STOP FOLLOW</button>`,
        );
      if (inCockpit) {
        actions.push(
          `<button type="button" data-ee-sel="prev" ${cock.navigation?.canPrevious ? '' : 'disabled'}>PREV</button>`,
        );
        actions.push(
          `<button type="button" data-ee-sel="next" ${cock.navigation?.canNext ? '' : 'disabled'}>NEXT</button>`,
        );
        actions.push(
          `<button type="button" data-ee-sel="cockpit-exit">EXIT COCKPIT</button>`,
        );
      } else {
        actions.push(
          `<button type="button" data-ee-sel="cockpit" ${following && !block ? '' : 'disabled'} title="${esc(block || 'Enter cockpit')}">COCKPIT</button>`,
        );
      }
    } else if (kind === 'camera') {
      actions.push(`<button type="button" data-ee-sel="open-cam">OPEN</button>`);
    } else if (kind === 'sea' || kind === 'space') {
      if (!following)
        actions.push(
          `<button type="button" data-ee-sel="follow">FOLLOW</button>`,
        );
      else
        actions.push(
          `<button type="button" data-ee-sel="stop">STOP FOLLOW</button>`,
        );
    } else if (kind === 'world-event') {
      // SELECT ≠ FOLLOW. Follow stays UNAVAILABLE until retention + notify exist.
      const graphicsDown = Boolean(
        document.documentElement?.classList?.contains('ee-graphics-failed'),
      );
      const followActs = eventFollowAvailability({
        eventId: subject.id,
        selected: true,
      });
      actions.push(
        `<button type="button" data-ee-sel="inspect">DETAILS</button>`,
      );
      if (Number.isFinite(subject.lat) && Number.isFinite(subject.lon)) {
        if (graphicsDown) {
          actions.push(
            `<button type="button" data-ee-sel="fly" data-ee-map-dependent="1" disabled aria-disabled="true" title="UNAVAILABLE — fly-to needs the 3D globe (renderer unavailable)">FLY TO · UNAVAILABLE</button>`,
          );
        } else {
          actions.push(
            `<button type="button" data-ee-sel="fly" data-ee-map-dependent="1">FLY TO</button>`,
          );
        }
      }
      if (followActs.available) {
        actions.push(
          `<button type="button" data-ee-sel="follow" data-ee-follow="1">FOLLOW</button>`,
        );
      } else {
        actions.push(
          `<button type="button" data-ee-sel="follow" data-ee-follow="unavailable" disabled aria-disabled="true" title="${esc(followActs.reason)}">${esc(EVENT_FOLLOW_CONTROL_LABEL)}</button>`,
        );
      }
    } else if (kind === 'quake' || kind === 'fire' || kind === 'alert') {
      actions.push(`<button type="button" data-ee-sel="fly">FLY TO</button>`);
      actions.push(
        `<button type="button" data-ee-sel="inspect">DETAILS</button>`,
      );
    } else if (kind === 'road' || kind === 'other') {
      actions.push(`<button type="button" data-ee-sel="fly">FLY TO</button>`);
      actions.push(
        `<button type="button" data-ee-sel="inspect">DETAILS</button>`,
      );
    } else {
      actions.push(`<button type="button" data-ee-sel="fly">FLY TO</button>`);
      actions.push(
        `<button type="button" data-ee-sel="inspect">DETAILS</button>`,
      );
    }

    actions.push(`<button type="button" data-ee-sel="clear" class="ee-sel-clear">✕</button>`);

    card.hidden = false;
    card.dataset.kind = kind;
    card.dataset.following = String(following);
    card.dataset.stale = String(stale);
    card.innerHTML = `
      <div class="ee-sel-main">
        <span class="ee-sel-kind">${esc(kind === 'world-event' ? 'WORLD EVENT' : kind.toUpperCase())}</span>
        <b class="ee-sel-label">${esc(subject.label || subject.id)}</b>
        ${following ? '<span class="ee-badge" data-tone="live">FOLLOW</span>' : '<span class="ee-badge" data-tone="off">SELECT</span>'}
        ${stale ? '<span class="ee-badge" data-tone="bad">STALE</span>' : ''}
      </div>
      ${!following && (kind === 'air' || kind === 'mil') ? '<p class="ee-sel-hint ee-dim">Tap again on the aircraft to FOLLOW, or use FOLLOW.</p>' : ''}
      ${kind === 'quake' || kind === 'fire' || kind === 'alert' ? `<p class="ee-sel-hint ee-dim">${esc(subject.props?.note || subject.props?.source || 'Public feed event — not predictive.')}</p>` : ''}
      ${kind === 'world-event' ? `<p class="ee-sel-hint ee-dim" data-ee-we-sel-disclosure="1">${esc(subject.props?.note || EVENT_FOLLOW_SELECT_NOTE)}</p>` : ''}
      ${kind === 'road' ? '<p class="ee-sel-hint ee-dim">Road conditions — not for navigation.</p>' : ''}
      ${block && !inCockpit && following ? `<p class="ee-sel-hint ee-dim">${esc(block)}</p>` : ''}
      <div class="ee-sel-actions">${actions.join('')}</div>`;
  }

  function setSubject(next) {
    subject = next;
    render();
  }

  function syncFromTracked() {
    if (!subject || (subject.layerId !== 'flights' && subject.layerId !== 'military'))
      return;
    const info = getFlightsTracked?.();
    if (!info) return;
    const stale = Boolean(info.stale);
    const following = true;
    if (subject.stale !== stale || subject.following !== following) {
      subject = { ...subject, stale, following, label: info.callsign || info.registration || subject.label };
      render();
    }
  }

  async function onAction(action) {
    try {
      if (action === 'clear') {
        await runAction('stop_tracking', {});
        setSubject(null);
        say('Selection cleared', 'info');
        return;
      }
      if (action === 'stop') {
        await runAction('stop_tracking', {});
        if (subject) setSubject({ ...subject, following: false, stale: false });
        say('Follow stopped — contact still selected.', 'info');
        return;
      }
      if (action === 'follow' && subject) {
        const r = await runAction('track_entity', {
          query: subject.label || subject.id,
          layerId: subject.layerId,
        });
        if (r?.ok === false) {
          say(esc(r.error || 'Follow failed'), 'bad');
          return;
        }
        setSubject({ ...subject, following: true });
        say(`Following ${esc(subject.label || subject.id)}`, 'ok');
        return;
      }
      if (action === 'cockpit') {
        const r = await runAction('control_cockpit', { action: 'enter' });
        if (r?.ok === false) {
          say(esc(r.error || cockpitReason() || 'Cockpit unavailable'), 'warn');
          render();
          return;
        }
        say('Cockpit entered', 'ok');
        render();
        return;
      }
      if (action === 'cockpit-exit') {
        await runAction('control_cockpit', { action: 'exit' });
        say('Cockpit exited', 'info');
        render();
        return;
      }
      if (action === 'prev' || action === 'next') {
        const r = await runAction('control_cockpit', {
          action: action === 'next' ? 'next' : 'previous',
        });
        if (r?.ok === false)
          say(esc(r.error || 'No further contact'), 'warn');
        render();
        return;
      }
      if (action === 'open-cam' && subject) {
        const r = await runAction('control_cctv', {
          action: 'open',
          id: subject.id,
        });
        if (r?.ok === false) say(esc(r.error || 'Camera unavailable'), 'warn');
        return;
      }
      if (action === 'fly' && subject) {
        const lat = subject.lat;
        const lon = subject.lon;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const r = await runAction('fly_to_location', {
            latitude: lat,
            longitude: lon,
            label: subject.label,
          });
          if (r?.ok === false) say(esc(r.error || 'Fly failed'), 'bad');
          else say(`Flying to ${esc(subject.label || 'selection')}`, 'ok');
        } else {
          say('No coordinates for this selection', 'warn');
        }
        return;
      }
      if (action === 'inspect' && subject) {
        if (
          subject.layerId === 'world-events' &&
          typeof openWorldEventDetail === 'function'
        ) {
          openWorldEventDetail(subject.id);
          say(
            `<b>${esc(subject.label || subject.id)}</b> · event detail (RELATED ≠ causal)`,
            'info',
          );
          return;
        }
        const r = await runAction('get_entity_context', {
          layerId: subject.layerId,
          id: subject.id,
        });
        if (r?.ok === false) say(esc(r.error || 'No details'), 'warn');
        else
          say(
            `<b>${esc(subject.label || subject.id)}</b> · ${esc(r?.summary || r?.note || 'Details loaded in Context')}`,
            'info',
          );
        return;
      }
    } catch (err) {
      say(esc(err?.message || err || 'Action failed'), 'bad');
    }
  }

  card.addEventListener(
    'click',
    (event) => {
      const btn = event.target.closest('[data-ee-sel]');
      if (!btn || btn.disabled) return;
      void onAction(btn.getAttribute('data-ee-sel'));
    },
    { signal },
  );

  const onSelected = (event) => {
    const d = event.detail || {};
    const info = getFlightsTracked?.();
    const following = Boolean(
      info && (info.icao24 === d.id || info.id === d.id),
    );
    setSubject({
      layerId: d.layerId || 'flights',
      id: d.id,
      label: d.label || (following && info.callsign) || d.id,
      following,
      stale: Boolean(following && info?.stale),
    });
  };
  const onCleared = () => setSubject(null);
  const onStale = (event) => {
    const d = event.detail || {};
    if (!subject || subject.id !== d.id) return;
    setSubject({ ...subject, stale: Boolean(d.stale), following: true });
    if (d.stale) say(`STALE — ${esc(subject.label || subject.id)} coasting on last fix`, 'warn');
    else say(`Live again — ${esc(subject.label || subject.id)}`, 'ok');
  };

  const onEntity = (event) => {
    const d = event.detail || {};
    const layerId = d.layerId || 'other';
    // Aircraft use awareness lane — ignore duplicate entity publishes if any.
    if (layerId === 'flights' || layerId === 'military') return;
    setSubject({
      layerId,
      id: d.id,
      label: d.label || d.id,
      following: false,
      stale: false,
      lat: Number.isFinite(d.latitude) ? d.latitude : null,
      lon: Number.isFinite(d.longitude) ? d.longitude : null,
      props: d.properties || null,
    });
  };
  window.addEventListener('gev:awareness-subject-selected', onSelected, {
    signal,
  });
  window.addEventListener('gev:awareness-subject-cleared', onCleared, {
    signal,
  });
  window.addEventListener('gev:awareness-subject-stale', onStale, { signal });
  window.addEventListener('gev:entity-selected', onEntity, { signal });
  window.addEventListener('gev:entity-selection-cleared', onCleared, {
    signal,
  });

  poll = setInterval(syncFromTracked, 2000);
  if (typeof poll.unref === 'function') poll.unref();
  signal?.addEventListener(
    'abort',
    () => {
      clearInterval(poll);
      card.remove();
    },
    { once: true },
  );

  return {
    render,
    getSubject: () => subject,
    setSubject,
    /** TRACK workspace / external sync */
    highlight(layerId, id, label) {
      setSubject({
        layerId,
        id,
        label: label || id,
        following: false,
        stale: false,
      });
    },
  };
}
