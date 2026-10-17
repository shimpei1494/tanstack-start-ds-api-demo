// Verify Oxlint diagnoses errors in every authored TypeScript area.
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const areas = ['apps/web/src', 'packages/db/src', 'packages/ds-contract/src', 'packages/ds-client/src', 'packages/chat-adapter/src', 'tests'];
const probes = areas.map((area) => `${area}/typecheck-probe.ts`);
try {
  for (const file of probes) {
    await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    await writeFile(file, 'export const typecheckProbe: string = 123;\n');
  }
  const result = spawnSync('npx', ['--no-install', 'oxlint', '--type-aware', '--type-check'], { encoding: 'utf8' });
  const output = `${result.stdout}\n${result.stderr}`;
  const missing = probes.filter((file) => !output.includes(file));
  if (result.status === 0 || missing.length) throw new Error(`Type-check coverage failed: ${missing.join(', ')}\n${output}`);
  console.log(`Oxlint detected deliberate type errors in ${probes.length} areas.`);
} finally {
  await Promise.all(probes.map((file) => rm(file, { force: true })));
}
