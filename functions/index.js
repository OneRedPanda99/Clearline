/**
 * Clearline Cloud Functions — team account admin
 *
 * setUserPassword  — Owner (any user) or Manager (own workers) sets a password
 * deleteAuthUser   — Owner rolls back an Auth user if Firestore profile write failed
 *
 * Deploy: firebase deploy --only functions
 * No extra secrets required beyond default Firebase Admin credentials.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function loadCaller(uid) {
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'No user profile');
  }
  return Object.assign({ uid }, snap.data() || {});
}

async function assertCanManageTarget(caller, targetUid) {
  if (!targetUid || typeof targetUid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'uid required');
  }
  if (caller.role === 'owner') return;

  if (caller.role !== 'manager') {
    throw new functions.https.HttpsError('permission-denied', 'Owner or manager required');
  }

  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Target user not found');
  }
  const target = targetSnap.data() || {};
  if (target.role === 'owner') {
    throw new functions.https.HttpsError('permission-denied', 'Cannot change Owner password here');
  }
  if (target.assignedManager !== caller.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your team member');
  }
}

function validatePassword(pw) {
  if (!pw || typeof pw !== 'string' || pw.length < 6) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Password must be at least 6 characters'
    );
  }
  if (pw.length > 128) {
    throw new functions.https.HttpsError('invalid-argument', 'Password too long');
  }
}

exports.setUserPassword = functions.https.onCall(async (data, context) => {
  const caller = await loadCaller(context.auth && context.auth.uid);
  const uid = data && data.uid;
  const newPassword = data && data.newPassword;
  validatePassword(newPassword);
  await assertCanManageTarget(caller, uid);

  try {
    await admin.auth().updateUser(uid, { password: newPassword });
    await db.collection('users').doc(uid).set(
      {
        passwordSetAt: new Date().toISOString(),
        passwordSetBy: caller.uid,
        lastUpdated: new Date().toISOString()
      },
      { merge: true }
    );
    return { ok: true };
  } catch (err) {
    console.error('setUserPassword failed', err);
    if (err.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'Auth user not found');
    }
    throw new functions.https.HttpsError('internal', err.message || 'Failed to set password');
  }
});

exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
  const caller = await loadCaller(context.auth && context.auth.uid);
  if (caller.role !== 'owner') {
    throw new functions.https.HttpsError('permission-denied', 'Owner only');
  }
  const uid = data && data.uid;
  if (!uid || typeof uid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'uid required');
  }
  if (uid === caller.uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot delete your own Auth user');
  }

  // Only delete if there is NO Firestore profile (orphan cleanup after failed create)
  const profile = await db.collection('users').doc(uid).get();
  if (profile.exists) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'User profile exists — deactivate instead of deleting Auth'
    );
  }

  try {
    await admin.auth().deleteUser(uid);
    return { ok: true };
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      return { ok: true, alreadyGone: true };
    }
    console.error('deleteAuthUser failed', err);
    throw new functions.https.HttpsError('internal', err.message || 'Delete failed');
  }
});
