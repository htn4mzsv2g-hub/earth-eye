# EARTH EYE — NAV / GPS ROADMAP AMENDMENT
# Ruben 2026-09-29 ~2:52 AM CT — owner decision: adopt best NAV path.
# ROADMAP ONLY. Do NOT open billable TomTom/Mapbox keys or live NAV yet.
#
# Path:
#   1) TomTom Orbis — first choice for routing / traffic-aware NAV
#   2) Mapbox — secondary candidate
#   Forbidden for Cesium route geometry: Google Directions / Apple Maps route polylines
#   Waze: not a core provider
#
# Status vocabulary: NEEDS_KEY / cost-gated. Honest labels only (never imply
# live traffic or turn-by-turn without a configured, permitted provider).
#
# Phases:
#   NAV-0 — audit only → docs/NAV0_AUDIT.md (inventory, reuse, candidates, gaps)
#   NAV-1+ — design / keyed integration only after owner spend approval
#   NAV-2 (2026-09-29 owner): TomTom Orbis FREE TIER only — wire adapter;
#     owner sets Fly secret TOMTOM_API_KEY. Mapbox still NOT. Caps:
#     routing 20K/mo, tiles 200K/mo, incident-details 2.5K/mo.
#
# Continue Stage 5 workspaces/hardening; do not derail.
# Broadcastify HELD. LiveATC blocked. Option C unchanged. No push.
#
# Full owner chat text is authoritative when present alongside this file.
