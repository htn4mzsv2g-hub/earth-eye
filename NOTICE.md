# NOTICE — Earth Eye

**Earth Eye is based on God's Eye View by Bilawal Sidhu (MIT).**

- Upstream project: <https://github.com/bilawalsidhu/gods-eye-view>
- Imported at commit `81eb44340d90feda5b5283438f6e5fdad5cabbdd` (2026-09-27)
- Upstream license: MIT, reproduced unchanged in [`LICENSE`](LICENSE)
  (Copyright (c) Bilawal Sidhu). The MIT notice must stay with every copy or
  substantial portion of this code.

Earth Eye is a personal, local fork. It is not affiliated with, endorsed by or
supported by the upstream author.

## Code vs. data: two different sets of terms

| What | Terms |
| --- | --- |
| Application source code (upstream and Earth Eye changes) | MIT, see `LICENSE` |
| Third-party npm packages (e.g. Apache-2.0 Web RTL-SDR) | Their own licenses, see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and `package-lock.json` |
| Bundled third-party assets (3D models, datasets, scene packs) | Their own licenses, see [`DATA_SOURCES.md`](DATA_SOURCES.md) and [`public/models/README.md`](public/models/README.md) |
| Live data fetched at runtime (flights, ships, satellites, fires, weather, cameras, map tiles, geocoders, etc.) | Each provider's own terms, see [`DATA_SOURCES.md`](DATA_SOURCES.md) and the in-app **CREDITS** panel |

The MIT license covers the code only. It grants **no** rights to any
third-party data, imagery, tiles, feeds or models. Several of those are
**non-commercial only** or **share-alike**, among them TeleGeography submarine
cables (CC BY-NC-SA), the Bhote Koshi flood scene (non-commercial), OpenSky
(non-commercial research use), Cesium ion Community (personal/non-commercial),
OpenStreetMap (ODbL, attribution + share-alike on the database) and Google Map
Tiles (Google Maps Platform terms, on-screen attribution required).

## What Earth Eye changed

- Rebranding: name **Earth Eye** (eartheye.us), wordmark and globe mark from
  Ruben's artwork (`public/brand/`), animated header logo, favicons/OG image,
  rewritten UI copy, honest HUD labels (no fake classification markings),
  identifying User-Agents (`earth-eye-*`).
- Earth Eye console (`src/atlas/*`, internal folder name kept): typed command bar with a keyless rule parser,
  feed-status panel with per-layer LIVE / FALLBACK / SIMULATED / NEEDS KEY /
  BUNDLED badges, provider-key panel (set/unset only, never values), credits,
  safety and help panels, disclaimer banner, snapshot, cinematic tour.
- `GET /api/atlas/provider-status` (loopback only): reports which env vars are
  set, never their values.
- Clearly labelled keyless fallbacks: NASA FIRMS public 24h files when
  `FIRMS_MAP_KEY` is unset; AMSAT TLEs for the ISS/stations group when CelesTrak
  is unreachable; an extra Overpass mirror.
- The first-run launcher is opt-in (`?welcome=1`); the app opens straight into
  the globe.
- Tests pinned to upstream strings were updated to match the changes above.

Everything else (layers, providers, map modes, cockpit, director, scenes,
whiteboard, sensor modes, voice, attribution lightbox, safety warnings) is
upstream code, kept intact.
