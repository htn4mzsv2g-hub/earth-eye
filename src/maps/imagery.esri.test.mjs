import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createEsriImagery,
  ESRI_WORLD_IMAGERY_MAX_LEVEL,
  ESRI_WORLD_IMAGERY_TILE_URL,
} from './imagery.js';
import { createDefaultMapSources } from './defaultSources.js';

test('Esri imagery uses UrlTemplate with city-scale maximumLevel 19', async () => {
  const provider = await createEsriImagery();
  assert.ok(provider instanceof Cesium.UrlTemplateImageryProvider);
  assert.equal(provider.maximumLevel, ESRI_WORLD_IMAGERY_MAX_LEVEL);
  assert.equal(ESRI_WORLD_IMAGERY_MAX_LEVEL, 19);
  assert.match(ESRI_WORLD_IMAGERY_TILE_URL, /World_Imagery\/MapServer\/tile/);
});

test('Esri tile-failure OSM fallback threshold is high (not 2)', () => {
  const sources = createDefaultMapSources();
  const esri = sources.sources.find((s) => s.descriptor.id === 'esri-imagery');
  assert.equal(esri.tileFailureFallback.id, 'osm');
  assert.ok(esri.tileFailureFallback.threshold >= 16);
});
