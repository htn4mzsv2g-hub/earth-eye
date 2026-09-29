# EE checkpoint verification

Local verification on 2026-09-29 (CT).

## Repository

- HEAD: `6d9a206dfff9f3c1d83b9094641531e5cd355e66`
- Required files: all present — `package-lock.json`, `fly.toml`, `Dockerfile`, `LICENSE`, `NOTICE.md`, `HANDOFF.md`, `.env.example`.

## Commands

| Check | Result |
|---|---|
| `npm ci` | exit `0` (succeeded; no `npm install` fallback needed) |
| `npm run build` | exit `0` (production build succeeded) |
| `node --test src/atlas/audit10Workflow.test.mjs` | exit `0`; **9/9 pass**, 0 fail |
| `npm test` (120s timeout) | exit `1`; 5,439 pass, **62 fail**, 1 skipped, 5,502 total |

## Full failing test titles from `npm test`

The following 62 test titles failed in the captured run:

1. data setup seals the caller catalog before controls can restore and drains its exact instances
2. catalogs construct distinct layers and classification from their supplied source
3. excluded layers have no user-facing control: ALPR, simulated traffic and radio are hidden from the layer panel
4. EE-LIVE-5: selected_entity shares exact Earth Eye identity
5. selection card mounts hidden and shows FOLLOW/COCKPIT for air subject
6. fire-camera packs are flagged non-commercial and not loaded
7. OSM attribution introduces displayed data for five seconds, then stays discoverable in the overflow
8. real earthquake lifecycle publishes host labels while runtime entities carry no label graphic
9. quake disc axes are STATIC — a per-frame callback re-tessellates ground geometry
10. earthquake refresh reports failure and clears it only after a successful response
11. malformed earthquake refresh preserves entities, overlays, count and timestamp
12. production registry is exact, canonical, and rejects incomplete contracts
13. renders ordinary layer rows without recreating a panel-hidden coordinator
14. keyboard focus survives Data Layer enabling and disabling transitions
15. a failed Data Layer transition clears busy state without losing keyboard focus
16. a layer that declares row controls renders its chips and color legend
17. clicking a row chip applies the params it declared and re-renders
18. a click outside a chip is inert, and a throwing layer cannot blank the panel
19. keyboard focus on a chip survives the refresh its own click triggers
20. an async layer pushes its own row refresh, and a busy chip refuses clicks
21. a layer that surrenders its row controls hides the block entirely
22. panel remount releases old listeners and destruction revokes retained controls
23. row action chips use live disabled state and descriptive counts without writing parameters
24. row notifications coalesce with animation frame and stop after destroy
25. row notifications coalesce with timeout and stop after destroy
26. row info and legends reconcile in place while chips retain focus and order
27. clicking a selected installation again or empty map clears it through refresh
28. clearing a stale installation highlight does not clear or reclaim another layer selection
29. switching sites keeps the new selection through refresh and disable clears it
30. real enabled installation entities carry no native label graphics
31. Context focus past the render cap selects for real instead of flying blind
32. a footprint-less relation just outside the viewport still renders
33. a legacy-shaped payload at the cap fires the exact-viewport retry end to end
34. a failed load buys the frame its status change needs
35. off-viewport records from the snapped superset never render or enter context
36. a saturated snapped tile refetches the exact viewport before rendering
37. an unsaturated response never pays for a second upstream ask
38. a still-saturated exact viewport is reported honestly instead of implied complete
39. a floor that lands after the render deadline lifts the dots off the ellipsoid
40. reports bounded installation requests as loading and clears on settlement
41. zoom-out aborts an active installation request and returns non-loading guidance
42. the retry is wired to every lifecycle edge, not just declared
43. both layers gate the tracked-model load and record its failures
44. a click on a storm card or lead-hour label selects that storm without picking
45. advisory selection uses accessible row descriptors and shared camera handoff
46. late refresh cannot publish after disable, re-enable, or destroy
47. two displays own separate data sources and destruction
48. an automatic fallback to Google 3D drops the swipe instead of re-leasing Esri; a manual switch re-leases once (subscription)
49. an automatic fallback to Google 3D drops the swipe instead of re-leasing Esri; a manual switch re-leases once (stats poll)
50. traffic recovers a failed destination request after another city has loaded
51. universal notice lifecycle clears on dispose and uses the one top-center live region
52. CelesTrak retains fresh and stale TLE caches
53. reference factories retain compatibility without starting acquisition or sharing instances
54. outbound User-Agents describe a private hosted instance, never "personal local instance"
55. dev-only flag: a production build can never enable the excluded features
56. registry refuses ALPR and simulated traffic; radio is COMMS-pending (not blanket excluded)
57. shared enable gate: toggle, setEnabled and restore all refuse excluded layers, and the gate is not removable
58. typed commands still omit radio (COMMS pending), traffic and ALPR
59. data providers have both hooks; credential editing stays development-only
60. provider-status reports set/unset only and never leaks key values
61. readout rows contain only toggles and metadata; ordinary rows retain controls
62. the Recent Imagery readout mounts in its rail body like the weather readout and is rebuilt or released with the panel
