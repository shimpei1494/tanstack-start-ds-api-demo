import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const violations = [];
async function walk(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, file.name);
    if (file.isDirectory()) {
      if (!['node_modules', 'generated', 'migrations'].includes(file.name)) await walk(name);
    } else if (/\.[cm]?[jt]sx?$/.test(name) && !/\.test\./.test(name)) {
      const source = await readFile(name, 'utf8');
      const imports = [...source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)/g)].map(
        (m) => m[1],
      );
      const isUi = /apps\/web\/src\/(routes|features|queries)\//.test(name);
      const isService = name.includes('/server/services/');
      const isFunction = name.includes('/server/functions/');
      for (const target of imports) {
        if (
          isUi &&
          /@demo\/(db|ds-client)|server\/(services|dependencies)|\.server(?:$|\.)/.test(target)
        )
          violations.push(`${name}: UI cannot import ${target}`);
        if (isService && /drizzle|^pg$|@demo\/db|react|react-start|dependencies/.test(target))
          violations.push(`${name}: services must depend on ports, not ${target}`);
        if (isFunction && /@demo\/db|drizzle|^pg$/.test(target))
          violations.push(`${name}: functions cannot access persistence directly`);
      }
      if (isService && /\bfetch\s*\(/.test(source))
        violations.push(`${name}: HTTP belongs in ds-client`);
    }
  }
}
await walk('apps/web/src');
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log('Backend dependency boundaries passed.');
