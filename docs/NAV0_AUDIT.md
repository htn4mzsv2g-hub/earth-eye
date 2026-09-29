# NAV-0 audit — routing / GPS (audit only, no spend)

Date: 2026-09-29 ~3:00 AM CT (America/Chicago)
Controlling: `docs/NAV_GPS_AMENDMENT_2026-09-29.md` (+ `/workspace/earth-eye-spec/` mirror)
Owner decision: adopt best NAV path — **TomTom Orbis #1**, **Mapbox #2**.
**No billable keys. No live NAV integration in this slice.**

Status vocabulary: `NEEDS_KEY` / cost-gated. Honest labels only.  
Forbidden for Cesium route geometry: Google Directions / Apple Maps polylines.  
Waze: not a core provider. Broadcastify HELD. LiveATC blocked. Option C unchanged. No push.

## 1. Inventory — GEV / Earth Eye routing & nav surfaces

| Piece | Path | Role today | EE production notes |
| --- | --- | --- | --- |
| Directions layer | `src/layers/directions/`, `src/data/directions.js` | Interactive A→B turn-by-turn UI; calls `/api/route` | Present in codebase; FOSSGIS commercial/heavy-use policy is a hosted concern |
| OSRM proxy | `server/providers/places/routes.js` via `places.js` / `overpass.js` install | Proxies FOSSGIS OSRM (`routing.openstreetmap.de`); 1 rps outbound gate, cache 10 min, span/size caps, `steps=1` optional | Keyless; fair-use only — not a commercial SLA |
| Route step copy | `src/data/routeSteps.js`, `placeProviderPayloads.js` | Normalize OSRM maneuvers → plain English | Reusable for any future provider that emits compatible steps |
| Voice / annotate routes | `src/annotations/annotationEngine.js`, voice `annotate_map` / `fly_route` | Street-following routes via same `/api/route` | Stage 3: **no straight-line fallback** — fails honestly as route unavailable |
| Camera “navigation” policy | `src/navigationPolicy.js` | Globe fly / cockpit handoff — **not** street GPS | Unrelated to turn-by-turn; keep separate |
| TomTom traffic tiles | `src/data/tomtomTiles.js`, `server/providers/traffic.js` `/api/tomtom` | Optional BYOK flow vector tiles; else **SIMULATED** particles | Traffic layer still **policy-excluded** in EE real-data default; **no `TOMTOM_API_KEY` on Fly secrets** (2026-09-29) |
| Mapbox | `@mapbox/vector-tile` only | MVT decode for tiles — **not** Mapbox Directions API | No Mapbox token / Directions usage |
| Google / Apple route geometry | — | Not used for Cesium route polylines | Keep forbidden per amendment |
| Waze | — | Not integrated | Not core |

Docs already describing this: `DATA_SOURCES.md` (OSRM + TomTom traffic), `FEATURES.md` (Directions LIVE via OSRM; Street Traffic SIMULATED / TomTom key), parity matrix `directions` + `annotate_map`.

## 2. Reuse list (do not rewrite)

1. **`/api/route` middleware shape** — rate limits, coalesce, cache, profile normalize, step projection: keep as the server façade; swap upstream behind it later.
2. **Directions layer + step UI** — provider-agnostic once request URL / payload adapter is pluggable.
3. **Annotation route path** — already honest on failure; plug the same façade.
4. **TomTom proxy + daily tile budget** — reuse patterns for Orbis/NAV keyed traffic if owner approves spend (separate from routing).
5. **Attribution / `dataCredits`** — extend; never imply live traffic or TBT without a configured permitted provider.
6. **Owner summary** — `GET /api/atlas/owner-summary` already exposes `nav` status string.

## 3. Candidates (owner ranking)

| Rank | Provider | Use | License / cost (as of audit; re-check before spend) | Status |
| --- | --- | --- | --- | --- |
| **#1** | **TomTom Orbis** (routing + optional traffic-aware NAV) | Primary street routing / NAV geometry on Cesium | Proprietary BYOK; free tiers exist for some TomTom APIs (traffic tiles historically ~200K/mo free — **Orbis SKUs must be verified on developer.tomtom.com before any key**). Cost gate required. | `NEEDS_KEY` — **do not open key yet** |
| **#2** | **Mapbox** Directions / Navigation SDK APIs | Secondary if Orbis blocked or unfit | Proprietary token; Mapbox pricing tiers — cost gate. Vector-tile npm dep already present ≠ Directions license. | `NEEDS_KEY` — **do not open key yet** |
| Keep (non-commercial / fair-use) | **OSRM FOSSGIS** | Dev / low-volume interactive demo | FOSSGIS policy: attribution, 1 rps, no heavy/commercial without restrictions; ODbL data | Available keyless; **unsuitable as sole production commercial NAV** |
| Self-host later | Private OSRM / Valhalla | Escape hatch if volume grows | Ops cost (compute), OSM ODbL | Not started |
| Forbidden | Google Directions / Apple Maps route polylines on Cesium | — | ToS / product rule | Do not integrate for EE Cesium geometry |
| Out | Waze core | — | — | Not a core provider |

## 4. Gaps

- No pluggable **route provider interface** yet (OSRM hard-wired in places/routes).
- No Orbis / Mapbox Directions client, secrets, or cost governor for NAV.
- Fly `eartheye` secrets: login/session/ALLOWED_HOSTS only — **no TomTom, no Mapbox**.
- Traffic remains excluded / simulated path must not be sold as live NAV.
- FOSSGIS alone is a **licence/risk gap** for a hosted multi-user product.
- GPS device location / turn guidance UX not scoped (roadmap after keyed routing).
- iPhone lag remains open (orthogonal).

## 5. Recommended next slice (after Stage 5 solid + owner spend OK)

**NAV-1 (design only until spend approval):**  
Define `routeProvider` adapter (OSRM | TomTom Orbis | Mapbox) behind `/api/route`; honest `NEEDS_KEY` when unset; keep FOSSGIS as explicit `DEMO_FAIR_USE` label.  
**Do not** create billable keys in NAV-1 docs work.  

**NAV-2 (spend-gated):** Owner opens TomTom Orbis key → wire adapter + attribution + budget governor → optional Mapbox fallback. No Google/Apple geometry. No Waze core.

## 6. Explicitly not in NAV-0

- Opening TomTom or Mapbox accounts/keys  
- Live NAV / Orbis / Mapbox API calls  
- Any Google/Apple route geometry on Cesium  
- Waze integration  
- Weakening traffic/ALPR exclusions or inventing live congestion  
- Push to remote; new Fly spend beyond Option C

## 7. Next document touchpoints

- Keep `docs/NAV_GPS_AMENDMENT_2026-09-29.md` as the roadmap pointer.  
- Update `DATA_SOURCES.md` / registry only when a keyed provider is approved.  
- Continue Stage 5 (permitted history / hardening); fold NAV-1 design when Stage 5 slice is solid.
