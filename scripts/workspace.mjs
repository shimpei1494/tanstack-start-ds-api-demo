import { spawn } from 'node:child_process';
const [workspace, script, ...extra] = process.argv.slice(2);
const child = spawn('npm', ['run', script, '-w', workspace, '--', ...extra], {
  stdio: 'inherit',
  env: process.env,
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
