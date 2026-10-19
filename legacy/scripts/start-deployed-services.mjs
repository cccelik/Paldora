import { spawn } from 'node:child_process';

const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = new Set();
let shuttingDown = false;

function run(command, arguments_, options = {}) {
  return spawn(command, arguments_, {
    env: process.env,
    stdio: 'inherit',
    ...options,
  });
}

function waitFor(child, label) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      if (child.exitCode === 0) resolve();
      else reject(new Error(`${label} exited with code ${child.exitCode}`));
      return;
    }
    if (child.signalCode !== null) {
      reject(new Error(`${label} exited after ${child.signalCode}`));
      return;
    }
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${label} exited ${signal ? `after ${signal}` : `with code ${code}`}`,
        ),
      );
    });
  });
}

async function stopChildren(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal);
  }
  await Promise.allSettled(
    [...children].map((child) => waitFor(child, 'service')),
  );
}

async function main() {
  const migration = run(packageManager, ['db:migrate']);
  await waitFor(migration, 'database migration');

  const services = [
    {
      label: 'API',
      child: run(process.execPath, ['apps/api/dist/main.js']),
    },
    {
      label: 'worker',
      child: run(process.execPath, ['apps/worker/dist/main.js']),
    },
  ];
  for (const { child } of services) children.add(child);

  await Promise.race(
    services.map(async ({ child, label }) => {
      await waitFor(child, label);
      throw new Error(`${label} stopped unexpectedly`);
    }),
  );
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void stopChildren(signal).finally(() => process.exit(0));
  });
}

void main().catch((error) => {
  if (shuttingDown) return;
  console.error(error);
  void stopChildren().finally(() => process.exit(1));
});
