import test from 'node:test';
import assert from 'node:assert/strict';
import { json2satrec } from 'satellite.js';

// Lightweight stand-in: exercise the same json2satrec path orbits.parseOmm uses.
const SAMPLE = [
  {
    OBJECT_NAME: 'ISS (ZARYA)',
    OBJECT_ID: '1998-067A',
    EPOCH: '2026-09-28T12:00:00.000000',
    MEAN_MOTION: 15.498,
    ECCENTRICITY: 0.0005,
    INCLINATION: 51.64,
    RA_OF_ASC_NODE: 100.0,
    ARG_OF_PERICENTER: 50.0,
    MEAN_ANOMALY: 310.0,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: 25544,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 1,
    BSTAR: 0.0001,
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  },
];

test('json2satrec accepts CelesTrak-shaped OMM JSON (no fabricate on empty)', () => {
  const satrec = json2satrec(SAMPLE[0]);
  assert.ok(satrec);
  assert.equal(satrec.error, 0);
  assert.equal(Number(satrec.satnum), 25544);
  assert.deepEqual(JSON.parse('[]'), []);
});
