#!/usr/bin/env node
/**
 * Stage 5.5 matrix QA (unit). Honest pass/fail only — no physical-iPhone claims.
 *
 *   node scripts/qa-stage5-matrix.mjs
 *
 * Writes docs/STAGE5_MATRIX_QA.json (+ prints summary). Exit 1 on any fail.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const suites = [
  {
    id: 'policy-exclusions',
    files: ['src/stage2Policy.test.mjs', 'src/comms/providers.test.mjs'],
  },
  {
    id: 'mobile-perf-profile',
    files: ['src/app/mobileGpuProfile.test.mjs', 'src/renderGovernor.test.mjs'],
  },
  {
    id: 'permitted-history',
    files: [
      'server/collection/retentionPolicy.test.mjs',
      'server/providers/workspaces/store.test.mjs',
    ],
  },
  {
    id: 'nav2-route-provider',
    files: ['server/providers/places/routeProvider.test.mjs'],
  },
  {
    id: 'owner-hardening',
    files: [
      'server/entitlements/ownerEntitlements.test.mjs',
      'server/entitlements/auditLog.test.mjs',
      'server/hardening/cspAudit.test.mjs',
    ],
  },
  {
    id: 'data-sources-patch',
    files: ['src/atlas/dataSourcesPatch.test.mjs'],
  },
];

const startedAt = new Date().toISOString();
const results = [];

for (const suite of suites) {
  const args = ['--test', ...suite.files];
  const run = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const out = `${run.stdout || ''}\n${run.stderr || ''}`;
  const passMatch = out.match(/ℹ pass (\d+)/);
  const failMatch = out.match(/ℹ fail (\d+)/);
  const pass = Number(passMatch?.[1] || 0);
  const fail = Number(failMatch?.[1] || (run.status === 0 ? 0 : 1));
  results.push({
    id: suite.id,
    files: suite.files,
    ok: run.status === 0 && fail === 0,
    pass,
    fail,
    exitCode: run.status,
    emulation: true,
    physicalIphone: false,
  });
  console.log(
    `${run.status === 0 && fail === 0 ? 'PASS' : 'FAIL'} ${suite.id} — pass=${pass} fail=${fail}`,
  );
}

const summary = {
  ok: results.every((r) => r.ok),
  startedAt,
  finishedAt: new Date().toISOString(),
  label: 'unit-matrix; emulation only; not physical iPhone',
  constraints: {
    mapbox: 'not_wired',
    broadcastify: 'HELD',
    liveatc: 'blocked',
    tomtomKey: 'owner-separate; not invented',
  },
  results,
};
const outDir = path.join(ROOT, 'docs');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, 'STAGE5_MATRIX_QA.json'),
  JSON.stringify(summary, null, 2),
);

const md = `# Stage 5 matrix QA (unit)

Date: ${summary.finishedAt}
Label: **${summary.label}**

| Suite | Pass | Fail | OK |
| --- | ---: | ---: | --- |
${results.map((r) => `| ${r.id} | ${r.pass} | ${r.fail} | ${r.ok ? 'yes' : 'NO'} |`).join('\n')}

Overall: **${summary.ok ? 'PASS' : 'FAIL'}**

Constraints checked in notes only: Mapbox not wired; Broadcastify HELD; LiveATC blocked; no invented TomTom key.
Physical iPhone lag checklist remains open (\`docs/IPHONE_CHECKLIST.md\`).
`;
writeFileSync(path.join(outDir, 'STAGE5_MATRIX_QA.md'), md);
console.log(summary.ok ? '\nMATRIX PASS' : '\nMATRIX FAIL');
process.exit(summary.ok ? 0 : 1);
