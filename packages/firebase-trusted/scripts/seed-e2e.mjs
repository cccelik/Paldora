import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { NativeAccounts, NativeProfiles } from '../dist/index.js';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199' ||
  process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST !== '127.0.0.1:5001'
)
  throw new Error(
    'E2E fixtures require all four disposable Firebase emulators.',
  );

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `e2e-seed-${randomUUID()}`,
);
try {
  const auth = getAuth(app);
  const db = getFirestore(app);
  const accounts = new NativeAccounts(db, auth);
  const profiles = new NativeProfiles(db, auth);
  for (const suffix of ['desktop', 'mobile']) {
    for (const peer of [false, true]) {
      const uid = randomUUID();
      await auth.createUser({
        uid,
        email: `phase123-${peer ? 'peer-' : ''}${suffix}@example.invalid`,
        password: 'LocalFixturePassw0rd!',
        emailVerified: true,
      });
      await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
      await accounts.provision(uid);
      if (peer)
        await profiles.update(uid, {
          username: `phase123peer${suffix}`,
          displayName: 'Local Peer',
          onboardingState: 'complete',
        });
    }
    for (const purpose of ['photo', 'room']) {
      const uid = randomUUID();
      await auth.createUser({
        uid,
        email: `phase123-${purpose}-${suffix}@example.invalid`,
        password: 'LocalFixturePassw0rd!',
        emailVerified: true,
      });
      await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
      await accounts.provision(uid);
      await profiles.update(uid, {
        username: `phase123${purpose}${suffix}`,
        displayName: 'Local Peer',
        onboardingState: 'complete',
      });
    }
    const lifecycleUid = randomUUID();
    await auth.createUser({
      uid: lifecycleUid,
      email: `phase7-${suffix}@example.invalid`,
      password: 'LocalFixturePassw0rd!',
      emailVerified: true,
    });
    await auth.setCustomUserClaims(lifecycleUid, { paldoraAdmitted: true });
    await accounts.provision(lifecycleUid);
    await profiles.update(lifecycleUid, {
      username: `phase7${suffix}`,
      displayName: 'Phase Seven Member',
      onboardingState: 'complete',
    });
    const staffUid = randomUUID();
    await auth.createUser({
      uid: staffUid,
      email: `phase6-staff-${suffix}@example.invalid`,
      password: 'LocalFixturePassw0rd!',
      emailVerified: true,
    });
    await auth.setCustomUserClaims(staffUid, { paldoraAdmitted: true });
    await accounts.provision(staffUid);
    await profiles.update(staffUid, {
      username: `phase6staff${suffix}`,
      displayName: 'Local Moderator',
      onboardingState: 'complete',
    });
    await db.collection('nativeStaffGrants').doc(staffUid).set({
      status: 'active',
      role: 'administrator',
      createdAt: Date.now(),
    });
    const reporterUid = randomUUID();
    await auth.createUser({
      uid: reporterUid,
      email: `phase6-reporter-${suffix}@example.invalid`,
      password: 'LocalFixturePassw0rd!',
      emailVerified: true,
    });
    await auth.setCustomUserClaims(reporterUid, { paldoraAdmitted: true });
    await accounts.provision(reporterUid);
    await profiles.update(reporterUid, {
      username: `phase6reporter${suffix}`,
      displayName: 'Local Reporter',
      onboardingState: 'complete',
    });
    const actorUid = randomUUID();
    await auth.createUser({
      uid: actorUid,
      email: `phase6-actor-${suffix}@example.invalid`,
      password: 'LocalFixturePassw0rd!',
      emailVerified: true,
    });
    await auth.setCustomUserClaims(actorUid, { paldoraAdmitted: true });
    await accounts.provision(actorUid);
    await profiles.update(actorUid, {
      username: `phase6actor${suffix}`,
      displayName: 'Local Actor',
      onboardingState: 'complete',
    });
    await db.collection('nativeRooms').doc(actorUid).set({
      visibility: 'members',
      updatedAt: Date.now(),
    });
    const unadmittedUid = randomUUID();
    await auth.createUser({
      uid: unadmittedUid,
      email: `phase123-unadmitted-${suffix}@example.invalid`,
      password: 'LocalFixturePassw0rd!',
      emailVerified: true,
    });
    const suspendedUid = randomUUID();
    await auth.createUser({
      uid: suspendedUid,
      email: `phase123-suspended-${suffix}@example.invalid`,
      password: 'LocalFixturePassw0rd!',
      emailVerified: true,
    });
    await auth.setCustomUserClaims(suspendedUid, { paldoraAdmitted: true });
    await accounts.provision(suspendedUid);
    await accounts.suspend(suspendedUid);
  }
  process.stdout.write('Created disposable Phase 1–3 browser fixtures.\n');
} finally {
  await deleteApp(app);
}
