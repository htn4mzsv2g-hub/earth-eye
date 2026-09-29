# EE-EVENTS FOLLOW honesty — Findings

**Recorded:** 2026-09-29 (America/Chicago)  
**LIVE_WORLD ID:** EE-EVENTS-4 FOLLOW EVENT  
**Repo note:** Prior slice docs used `EE-EVENTS-4` for Analyst event tools (Fly v57). HANDOFF previously labeled FOLLOW as EE-EVENTS-5/6. This slice is the LIVE_WORLD FOLLOW honesty contract only.

**Base / rollback tip:** Fly **v58** `registry.fly.io/eartheye:deployment-01M3PGAHGY0RGMBPRWY6A64BD0` (no Fly deploy in this slice).

## Issue

World Events had SELECT + detail/RELATED, but FOLLOW was only absent (“No FOLLOW in this slice”) rather than an explicit UNAVAILABLE control with Select ≠ Follow and no-notify / no-continuous-watch honesty. Risk: users could read selection as “following updates,” or a future Follow affordance could claim alerts without a retention+notify mechanism.

## Root cause

FOLLOW EVENT was deferred. Aircraft already distinguished SELECT vs FOLLOW; World Events omitted Follow entirely without a shared availability contract or regression tests for forbidden alert claims.

## Fix (minimal honesty — no notification system)

1. `src/events/live/followAvailability.js` — Follow always `UNAVAILABLE`; `selectIsNotFollow`; claims `{ notifications: false, continuousWatch: false, durableRetention: false }`; stale/lost Follow state `applicable: false` until Follow exists; forbidden affirmative-claim patterns for tests.
2. Events panel — disabled `FOLLOW · UNAVAILABLE` control + SELECT ≠ FOLLOW note; lede updated.
3. Selection card — World Event shows SELECT badge even if caller sets `following: true`; disabled Follow control; disclosure uses honesty note.
4. Tests — `src/events/live/followHonesty.test.mjs` (8 journeys).

## Explicit non-claims

- No push / alert delivery.
- No continuous / 24/7 event watch.
- No durable followed-ids store (would be a later slice if product wants Follow without inventing alerts).
- No ATC / Broadcastify audio.
- No Cesium rewrite / GEV merge / Fly deploy in this slice.

## Evidence

- `node --test src/events/live/followHonesty.test.mjs` → 8/8 pass  
- `node --test src/events/live/followHonesty.test.mjs src/atlas/selectionCard.test.mjs src/events/live/eventsDetail3.test.mjs src/events/live/eventsUx.test.mjs` → 31/31 pass  

## Regression protection

Honesty journeys assert Follow UNAVAILABLE, Select ≠ Follow, no affirmative “you'll be notified” / alert-when-updates copy in UI strings and panel/card sources.
