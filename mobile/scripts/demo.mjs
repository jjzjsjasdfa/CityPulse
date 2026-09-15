import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
const child = spawn(process.execPath, ['node_modules/expo/bin/cli', ...(args.length ? args : ['start'])], {
  stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_DEMO_MODE: '1' },
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
