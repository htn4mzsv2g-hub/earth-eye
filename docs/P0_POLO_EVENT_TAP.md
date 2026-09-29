# P0 — Polo / HU event tap (2026-09-29 CT)

## What it is
- **Polo** = NHC Eastern Pacific hurricane `ep172026`, classification **HU**, advisory **34**.
- Issued `2026-09-29T03:00:00.000Z`; position as of `06:00Z` at **25.9°N, 112.2°W**; **95 kt**, **965 hPa**.
- `geometryStatus: pending` → track/cone not yet attached; marker is advisory center only.
- Colorful underlay in the screenshot is **GFS 10 m wind forecast** (valid `2026-09-29T07:00:00.000Z`), **not** the cyclone cone and not fire/hurricane “heat.”

## Why it failed
1. Storm card selected, but **no detail panel** opened on iPhone (weather sheet stayed closed).
2. Ambient **military-installations** Overpass fetch showed **FETCHING MAPPED SITES — OPENSTREETMAP**, looking like the tap “only” did place/OSM work.
3. Cyclones were not published to shared entity context (unlike FIRMS), so Analyst/readout could not explain the selection.
4. Overlay hit targets could be <44 CSS px on touch.

## Fix (this branch)
- Publish cyclone selection to context + `gev:event-detail-request` → open weather card + mobile LAYERS sheet.
- Enrich cyclone detail (id, temporal status, winds, pressure, movement, color meaning).
- ≥44 px overlay hit pads + `hitTestWorldOverlayAll` (event overlays win over empty place clear).
- Installations fetch **15s timeout**; loading chip demotes when an event is selected.
- Wind marked `productKind: forecast`; radar notes point values unavailable.
- Analyst `inspect_entity` / `select_entity` for `weather-cyclones`; typed “explain this”.

Option C unchanged (always-on + 1 GB volume + snapshots 5-day).
