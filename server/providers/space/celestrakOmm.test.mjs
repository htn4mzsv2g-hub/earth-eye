import test from 'node:test';
import assert from 'node:assert/strict';
import {
  celestrakGpUrl,
  isCelestrakGpBody,
} from '../../../src/data/spaceProviderRequests.js';

test('celestrakGpUrl requests FORMAT=json (OMM)', () => {
  const url = celestrakGpUrl('stations');
  assert.equal(url.searchParams.get('FORMAT'), 'json');
  assert.equal(url.searchParams.get('GROUP'), 'stations');
});

test('GP/OMM detector accepts a catalog array and rejects HTML, TLE text, and empty arrays', () => {
  const body = JSON.stringify([
    {
      OBJECT_NAME: 'ISS (ZARYA)',
      NORAD_CAT_ID: 25544,
      TLE_LINE1: '1 25544U',
      TLE_LINE2: '2 25544',
    },
  ]);
  assert.equal(isCelestrakGpBody(body), true);
  assert.equal(isCelestrakGpBody('<html>error</html>'), false);
  assert.equal(isCelestrakGpBody('ISS\n1 25544U\n2 25544\n'), false);
  assert.equal(isCelestrakGpBody('1 valid-fixture-TLE'), false);
  assert.equal(isCelestrakGpBody('[]'), false);
  assert.equal(isCelestrakGpBody('{"error":"502"}'), false);
});
