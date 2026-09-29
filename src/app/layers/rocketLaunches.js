import { createRocketLaunchesLayer } from '../../layers/launches/index.js';
import * as geometry from '../../celestialRing.js';
import * as overlays from '../../overlays/worldOverlay.js';
import * as render from '../../renderGovernor.js';
import { devExcludedFeaturesEnabled } from '../../policy/devFlags.js';

/** Construct one layer using the application scene owners and a supplied source. */
export function createApplicationLaunches({ source, satellites }) {
  return createRocketLaunchesLayer({
    source,
    services: {
      satellites,
      geometry,
      overlays,
      render,
      // Earth Eye: reconstructed ascent tracks and launch replay are dev-only.
      reconstructedTracks: () => devExcludedFeaturesEnabled(),
    },
  });
}
