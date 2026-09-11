import { readFile, writeFile } from 'node:fs/promises';
const check = process.argv.includes('--check');
for (const file of ['incidents.ts', 'places.ts']) {
  const source = new URL('../../lib/' + file, import.meta.url);
  const target = new URL('../src/domain/' + file, import.meta.url);
  // Repository root is two levels above this scripts directory.
  const body =
    '// Generated from the web domain. Run npm run sync:domain; do not edit here.\n' +
    (await readFile(source, 'utf8'));
  if (check) {
    if ((await readFile(target, 'utf8')) !== body)
      throw Error('Mobile domain drift: ' + file);
  } else await writeFile(target, body);
}
console.log(
  check ? 'Shared domain matches web source.' : 'Shared domain synced.',
);
