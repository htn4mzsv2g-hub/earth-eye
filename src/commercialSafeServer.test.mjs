// Stage 2: EE_COMMERCIAL_SAFE=1 stops the server from calling non-commercial
// providers (Open-Meteo, Google News RSS) and refuses non-commercial camera
// packs. Off by default. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commercialSafeMode,
  serviceBlockedByCommercialSafe,
} from '../server/providers/policy-flags.js';
import { fetchRegionalWeather } from '../server/providers/regional/weather.js';
import { fetchRegionalNews } from '../server/providers/regional/news.js';

function stubFetch(t) {
  const urls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ articles: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => (globalThis.fetch = original));
  return urls;
}

function withEnv(t, value) {
  const before = process.env.EE_COMMERCIAL_SAFE;
  if (value === undefined) delete process.env.EE_COMMERCIAL_SAFE;
  else process.env.EE_COMMERCIAL_SAFE = value;
  t.after(() => {
    if (before === undefined) delete process.env.EE_COMMERCIAL_SAFE;
    else process.env.EE_COMMERCIAL_SAFE = before;
  });
}

test('the flag is off by default and only "1" turns it on', () => {
  assert.equal(commercialSafeMode({}), false);
  assert.equal(commercialSafeMode({ EE_COMMERCIAL_SAFE: 'true' }), false);
  assert.equal(commercialSafeMode({ EE_COMMERCIAL_SAFE: '1' }), true);
  for (const s of ['opensky', 'open-meteo', 'google-news-rss'])
    assert.equal(
      serviceBlockedByCommercialSafe(s, { EE_COMMERCIAL_SAFE: '1' }),
      true,
      s,
    );
  assert.equal(
    serviceBlockedByCommercialSafe('gdelt', { EE_COMMERCIAL_SAFE: '1' }),
    false,
  );
});

test('commercial-safe ON: no Open-Meteo call and no Google News RSS call', async (t) => {
  withEnv(t, '1');
  const urls = stubFetch(t);
  assert.equal(
    await fetchRegionalWeather({ latitude: 30, longitude: -97 }),
    null,
  );
  await fetchRegionalNews({ locality: 'Austin' });
  assert.equal(
    urls.some((u) => /open-meteo/.test(u)),
    false,
  );
  assert.equal(
    urls.some((u) => /news\.google\.com/.test(u)),
    false,
  );
  assert.ok(
    urls.some((u) => /gdeltproject/.test(u)),
    'GDELT still used',
  );
});

test('commercial-safe OFF (default): the normal providers are used', async (t) => {
  withEnv(t, undefined);
  const urls = stubFetch(t);
  await fetchRegionalWeather({ latitude: 30, longitude: -97 });
  await fetchRegionalNews({ locality: 'Austin' });
  assert.ok(urls.some((u) => /open-meteo/.test(u)));
  assert.ok(urls.some((u) => /news\.google\.com/.test(u)));
});
