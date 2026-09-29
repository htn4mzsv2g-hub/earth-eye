# EE-EVENTS FOLLOW honesty — Milestone

**Shipped (code+tests):** 2026-09-29 (America/Chicago)  
**Directive:** LIVE_WORLD EE-EVENTS-4 FOLLOW EVENT + CHATGPT_NON3D FOLLOW/notifications not claimed without mechanism  
**Findings:** [`EE_EVENTS_FOLLOW_FINDINGS.md`](./EE_EVENTS_FOLLOW_FINDINGS.md)  
**Fly deploy:** **not** done in this slice (prefer parent after review)

## Delivered

1. SELECT ≠ FOLLOW for World Events (badge + copy + availability model).
2. Follow control present but **UNAVAILABLE** with honest reason (needs durable retention + notify; selecting ≠ following; no alert delivery; no continuous watch claim).
3. Stale/lost Follow handling documented as not applicable while Follow is UNAVAILABLE.
4. Unit/journey tests for the honesty contract.
5. No fake notify / continuous-watch product claims in event Follow UI.

## Numbering

| Spec stack | ID |
| --- | --- |
| LIVE_WORLD remediation | **EE-EVENTS-4** FOLLOW EVENT |
| Prior repo docs | EE-EVENTS-4 = Analyst tools (v57); FOLLOW was listed as EE-EVENTS-5/6 |
| This milestone | FOLLOW honesty complete; retention+notify product still future |

## Tests

```bash
node --test src/events/live/followHonesty.test.mjs
# related regression:
node --test src/events/live/followHonesty.test.mjs \
  src/atlas/selectionCard.test.mjs \
  src/events/live/eventsDetail3.test.mjs \
  src/events/live/eventsUx.test.mjs
```

## Stop

Honesty only. Do not invent notifications, durable follow stores, ATC audio, Photoreal billing, or Cesium rewrites here. Leave Fly deploy to parent if desired after review.
