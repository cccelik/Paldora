import assert from 'node:assert/strict';

const project = process.env.GCLOUD_PROJECT;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

assert.equal(project, 'demo-paldora', 'Use only the disposable demo project');
assert.ok(firestoreHost, 'Start the Firestore emulator first');
assert.ok(storageHost, 'Start the Storage emulator first');

const checks = [
  {
    name: 'Firestore read',
    url: `http://${firestoreHost}/v1/projects/${project}/databases/(default)/documents/users/guessed`,
    init: undefined,
  },
  {
    name: 'Firestore write',
    url: `http://${firestoreHost}/v1/projects/${project}/databases/(default)/documents/users`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { status: { stringValue: 'active' } } }),
    },
  },
  {
    name: 'Storage write',
    url: `http://${storageHost}/v0/b/${project}.appspot.com/o?uploadType=media&name=private%2Fguessed`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: 'private bytes',
    },
  },
];

for (const check of checks) {
  const response = await fetch(check.url, check.init);
  assert.equal(response.status, 403, `${check.name} must be denied`);
  process.stdout.write(`PASS ${check.name} denied\n`);
}
