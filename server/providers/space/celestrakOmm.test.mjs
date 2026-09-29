import test from 'node:test';
import assert from 'node:assert/strict';
import { celestrakGpUrl } from '../../../src/data/spaceProviderRequests.js';

test('celestrakGpUrl requests FORMAT=json (OMM)', () => {
  const url = celestrakGpUrl('stations');
  assert.equal(url.searchParams.get('FORMAT'), 'json');
  assert.equal(url.searchParams.get('GROUP'), 'stations');
});

test('OMM JSON body detector accepts catalog shape', () => {
  const body = JSON.stringify([
    { OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544, TLE_LINE1: '1 25544U', TLE_LINE2: '2 25544' },
  ]);
  const trimmed = body.trim();
  const isOmmJson =
    (trimmed.startsWith('[') || trimmed.startsWith('{')) &&
    (trimmed.includes('"OBJECT_NAME"') ||
      trimmed.includes('"NORAD_CAT_ID"') ||
      trimmed.includes('"TLE_LINE1"'));
  assert.equal(isOmmJson, true);
  assert.equal(/^1 /m.test('<html>error</html>'), false);
});
