/**
 * Clearline - Firebase Auth & Sync Module
 * 
 * This module handles:
 * - User authentication (Google sign-in)
 * - Cloud data sync via Firestore
 * - Offline-first with sync when online
 * 
 * Just sign in with Google and your data syncs automatically!
 */

const CL_FIREBASE = (function() {
    let app = null;
    let auth = null;
    let db = null;
    let currentUser = null;
    let calendarAccessToken = null;
    let calendarTokenExpiry = 0;
    let isInitialized = false;
    let initPromise = null;
    // Separate flags so a read-in-flight doesn't cause writes to be dropped.
    // A shared guard made `syncToCloud` silently return false whenever the
    // every-5s `syncFromCloud` was mid-network: local edits never reached
    // Firestore, so other devices never saw new customers.
    let pullInProgress = false;
    let pushInProgress = false;
    let pushPending = false;

    // Phase 2 state: the user's profile doc from `users/{uid}`.
    // Shape: { role, displayName, username, active, permissions, workerType?, assignedManager? }
    let userProfile = null;
    // Per-sign-in latch so we don't refetch / re-bootstrap mid-session.
    let profileLoaded = false;

    // Get Firebase config from CL_SECRETS (loaded via config.js)
    function getConfig() {
        return window.CL_SECRETS?.firebase || null;
    }

    // Check if Firebase is configured
    function isConfigured() {
        const config = getConfig();
        return !!(config && config.apiKey && config.projectId);
    }

    // Initialize Firebase
    function init() {
        if (isInitialized) return Promise.resolve(true);
        // Prevent concurrent initialization attempts
        if (initPromise) return initPromise;

        initPromise = _doInit();
        return initPromise;
    }

    async function _doInit() {
        const config = getConfig();
        if (!config) {
            console.log('Firebase not configured');
            initPromise = null;
            return false;
        }

        try {
            // Dynamically load Firebase SDK (sequentially)
            if (typeof firebase === 'undefined') {
                await loadFirebaseSDK();
            }

            // Initialize app
            if (!firebase.apps.length) {
                app = firebase.initializeApp(config);
            } else {
                app = firebase.apps[0];
            }

            auth = firebase.auth();
            db = firebase.firestore();

            // Enable offline persistence
            try {
                await db.enablePersistence({ synchronizeTabs: true });
            } catch (err) {
                if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
                    console.warn('Persistence error:', err.code);
                }
            }

            // Listen for auth state changes
            auth.onAuthStateChanged(handleAuthStateChange);

            isInitialized = true;
            console.log('Firebase initialized');
            return true;
        } catch (err) {
            console.error('Firebase init error:', err);
            initPromise = null;
            return false;
        }
    }

    // Load Firebase SDK dynamically (sequential – app must load before auth/firestore)
    async function loadFirebaseSDK() {
        function loadScript(src) {
            return new Promise((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) {
                    resolve();
                    return;
                }
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // App must be loaded first – the other compat packages depend on it
        await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
        await Promise.all([
            loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js'),
            loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js')
        ]);
    }

    // Handle auth state changes. Orchestrates profile load, the Owner
    // auto-bootstrap on first Google sign-in, inactive-account sign-out,
    // and the unauthenticated redirect to signin.html. Any page that
    // loads firebase-sync.js is therefore protected: no signed-in +
    // active user means the page redirects to the sign-in splash.
    async function handleAuthStateChange(user) {
        currentUser = user;
        // Reset per-session latches so each sign-in fires once.
        migrationRan = false;
        profileLoaded = false;
        userProfile = null;

        window.dispatchEvent(new CustomEvent('cl-auth-change', {
            detail: { user: user ? getUserInfo() : null }
        }));

        if (!user) {
            console.log('User signed out');
            redirectToSignIn();
            return;
        }
        console.log('User signed in:', user.email);

        try {
            await _loadOrSeedProfile();
        } catch (err) {
            console.error('[CL_FIREBASE] Profile load failed:', err);
            // Leave the user on the current page; let them retry. They may
            // be offline. Avoid a redirect loop.
            return;
        }

        // Block sign-in for deactivated accounts.
        if (userProfile && userProfile.active === false) {
            console.warn('[CL_FIREBASE] Account deactivated, signing out');
            try { await auth.signOut(); } catch (_) {}
            redirectToSignIn('deactivated');
            return;
        }

        // If we have an authenticated user with NO profile (email-password
        // user not yet provisioned by the Owner), don't keep them in a
        // half-authenticated state. Sign out + redirect with a hint.
        if (!userProfile) {
            console.warn('[CL_FIREBASE] No user profile — sign-in rejected');
            try { await auth.signOut(); } catch (_) {}
            redirectToSignIn('notprovisioned');
            return;
        }

        window.dispatchEvent(new CustomEvent('cl-profile-updated', {
            detail: { profile: Object.assign({}, userProfile) }
        }));

        // Only sync data once we know the account is active and provisioned.
        syncFromCloud();
    }

    // Read `users/{uid}`. If the doc is missing and this is a Google sign-in
    // for the configured Owner (or any Google sign-in when `ownerUid` is
    // blank on a fresh project), seed an Owner profile. Email/password
    // users without a pre-provisioned profile are rejected upstream.
    async function _loadOrSeedProfile() {
        if (profileLoaded) return;
        if (!currentUser || !db) return;
        const ref = db.collection('users').doc(currentUser.uid);
        const snap = await ref.get();
        const data = snap.exists ? snap.data() : null;
        if (data && data.role) {
            userProfile = {
                role: data.role,
                displayName: data.displayName || currentUser.displayName || '',
                username: data.username || currentUser.email || '',
                active: data.active !== false,
                permissions: data.permissions || {},
                workerType: data.workerType || null,
                assignedManager: data.assignedManager || null
            };
            profileLoaded = true;
            return;
        }

        // No role yet — attempt Owner bootstrap if this is a Google sign-in.
        const providerId = (currentUser.providerData[0] && currentUser.providerData[0].providerId) || '';
        const isGoogle = providerId === 'google.com';
        const configuredOwner = (window.CL_SECRETS && window.CL_SECRETS.ownerUid) || '';
        const ownerMatch = isGoogle && (!configuredOwner || configuredOwner === currentUser.uid);

        if (!ownerMatch) {
            userProfile = null;
            profileLoaded = true;
            return;
        }

        const bootstrap = {
            role: 'owner',
            displayName: currentUser.displayName || '',
            username: currentUser.email || '',
            active: true,
            permissions: {
                canCreateCustomers: true, canEditOwnCustomers: true,
                canCreateJobs: true, canAttachJobToCustomer: true, canEditOwnJobs: true,
                canUseEstimateForm: true, canSendEstimates: true,
                canViewCalendar: true, canViewMap: true
            },
            bootstrappedAt: new Date().toISOString()
        };
        await ref.set(bootstrap, { merge: true });
        userProfile = bootstrap;
        profileLoaded = true;
        console.log('[CL_FIREBASE] Owner profile bootstrapped');
    }

    // Redirect to the sign-in splash unless we're already there. Keeps the
    // query string intact so downstream code can show a contextual banner
    // (e.g. ?deactivated=1 or ?notprovisioned=1).
    function redirectToSignIn(reason) {
        if (typeof window === 'undefined') return;
        const here = (window.location.pathname || '').toLowerCase();
        if (here.endsWith('/signin.html') || here.endsWith('signin.html')) return;
        const q = reason ? ('?' + reason + '=1') : '';
        // Use replace so the signed-out page doesn't stay in back-history.
        window.location.replace('signin.html' + q);
    }

    // Get current user info
    function getUserInfo() {
        if (!currentUser) return null;
        return {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL
        };
    }

    // Sign in with email + password. Used by Managers and Workers, who are
    // always pre-provisioned by the Owner via the Manager Panel (Phase 3).
    // If the account isn't yet provisioned, `handleAuthStateChange` will
    // sign them back out with `?notprovisioned=1`.
    async function signInWithEmail(email, password) {
        if (!isInitialized) {
            const ready = await init();
            if (!ready) return { ok: false, code: 'init-failed' };
        }
        try {
            await auth.signInWithEmailAndPassword(email, password);
            return { ok: true };
        } catch (err) {
            console.error('Email sign-in error:', err);
            return { ok: false, code: (err && err.code) || 'unknown', message: err && err.message };
        }
    }

    // Sign in with Google (also requests Calendar access)
    async function signInWithGoogle() {
        if (!isInitialized) {
            const ready = await init();
            if (!ready) {
                alert('Could not connect to sync service. Please try again.');
                return null;
            }
        }

        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            // Request Calendar scope for unified auth
            provider.addScope('https://www.googleapis.com/auth/calendar.events');
            
            const result = await auth.signInWithPopup(provider);
            
            // Store the Calendar access token
            if (result.credential) {
                calendarAccessToken = result.credential.accessToken;
                // Token typically expires in 1 hour
                calendarTokenExpiry = Date.now() + (3600 * 1000);
                // Store for other pages
                localStorage.setItem('gcal-token', calendarAccessToken);
                localStorage.setItem('gcal-token-expiry', calendarTokenExpiry);
            }
            
            return getUserInfo();
        } catch (err) {
            console.error('Sign-in error:', err);
            if (err.code === 'auth/popup-blocked') {
                alert('Popup was blocked. Please allow popups for this site.');
            } else if (err.code === 'auth/popup-closed-by-user') {
                // User closed the popup, no alert needed
                return null;
            } else if (err.code === 'auth/unauthorized-domain') {
                alert('This domain is not authorized for sign-in yet.');
            } else {
                alert('Sign-in failed. Please try again.');
            }
            return null;
        }
    }

    // Get Calendar access token (for other modules to use)
    function getCalendarToken() {
        // Check if token is still valid
        if (calendarAccessToken && calendarTokenExpiry > Date.now()) {
            return calendarAccessToken;
        }
        // Try from localStorage
        const stored = localStorage.getItem('gcal-token');
        const expiry = parseInt(localStorage.getItem('gcal-token-expiry') || '0');
        if (stored && expiry > Date.now()) {
            calendarAccessToken = stored;
            calendarTokenExpiry = expiry;
            return stored;
        }
        return null;
    }

    // Check if Calendar is connected
    function isCalendarConnected() {
        return !!getCalendarToken();
    }

    // Sign out
    async function signOut() {
        if (auth) {
            await auth.signOut();
        }
        currentUser = null;
    }

    // ------------------------------------------------------------
    // Phase 1 storage model (new):
    //   * `customers/{id}` and `jobs/{id}` are top-level collections.
    //     Each doc carries a `createdBy` field with the owner's uid.
    //     This is the foundation for later cross-user visibility
    //     (Manager seeing Worker jobs, etc.) in Phase 2+.
    //   * `users/{uid}` still holds per-user state we don't want to
    //     expose to other roles: settings, deletedCustomers,
    //     deletedJobs, migrationVersion, lastSync.
    //   * A one-time migration moves the legacy blob arrays from the
    //     user doc into the top-level collections, then strips them.
    // ------------------------------------------------------------
    const MIGRATION_VERSION = 'v3';

    // True once per sign-in: prevents repeated migration attempts.
    let migrationRan = false;

    // Stamp a customer/job with the fields needed for the top-level
    // collection (createdBy + lastUpdated). Never overwrites an
    // existing createdBy — records keep their original author so
    // future rules scope them correctly.
    function _stampForCloud(entity) {
        if (!entity) return entity;
        const out = { ...entity };
        if (!out.createdBy && currentUser) out.createdBy = currentUser.uid;
        if (!out.lastUpdated) out.lastUpdated = new Date().toISOString();
        return out;
    }

    // Batch-upsert a list of records to a top-level collection, and
    // issue deletes for any ids in `tombstones`. Chunked to respect
    // Firestore's 500-ops-per-batch limit.
    // Non-owners only push docs they created, since rules reject other
    // writes and one bad op would fail the whole batch.
    async function _syncCollection(collName, items, tombstones) {
        const coll = db.collection(collName);
        const myUid = currentUser ? currentUser.uid : null;
        const canPushAll = userProfile && userProfile.role === 'owner';
        const mine = (v) => canPushAll || !v || !v.createdBy || v.createdBy === myUid;

        const ops = [];
        (items || []).forEach(it => {
            if (!it || !it.id) return;
            if (!mine(it)) return; // skip docs we can't write
            ops.push({ type: 'set', ref: coll.doc(it.id), data: _stampForCloud(it) });
        });
        (tombstones || []).forEach(t => {
            if (!t || !t.id) return;
            if (!canPushAll) return; // only Owner deletes cross-user entries
            ops.push({ type: 'delete', ref: coll.doc(t.id) });
        });

        for (let i = 0; i < ops.length; i += 450) {
            const batch = db.batch();
            ops.slice(i, i + 450).forEach(op => {
                if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
                else batch.delete(op.ref);
            });
            await batch.commit();
        }
    }

    // One-time migration from the legacy blob to top-level collections.
    // Idempotent via `users/{uid}.migrationVersion`.
    async function _runMigrationIfNeeded() {
        if (migrationRan) return;
        if (!currentUser || !db) return;
        const userRef = db.collection('users').doc(currentUser.uid);
        const snap = await userRef.get();
        if (snap.exists && snap.data().migrationVersion === MIGRATION_VERSION) {
            migrationRan = true;
            return;
        }

        const data = snap.exists ? snap.data() : {};
        const customers = Array.isArray(data.customers) ? data.customers : [];
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];
        if (customers.length || jobs.length) {
            console.log('[CL_FIREBASE] Phase-1 migration: moving',
                customers.length, 'customer(s) and', jobs.length,
                'job(s) to top-level collections');
            await _syncCollection('customers', customers, []);
            await _syncCollection('jobs', jobs, []);
        }
        // Strip the blob fields and stamp the version. Keep tombstones
        // + settings on the user doc.
        const patch = {
            migrationVersion: MIGRATION_VERSION,
            customers: firebase.firestore.FieldValue.delete(),
            jobs: firebase.firestore.FieldValue.delete()
        };
        await userRef.set(patch, { merge: true });
        migrationRan = true;
        console.log('[CL_FIREBASE] Phase-1 migration complete');
    }

    // Sync data to cloud. Writes each customer/job to its own top-level
    // doc and keeps tombstones + settings on the user doc. Coalesces
    // concurrent pushes via `pushPending` so debounced save bursts
    // collapse to one final upload.
    async function syncToCloud() {
        if (!currentUser || !db) return false;
        if (pushInProgress) {
            pushPending = true;
            return false;
        }

        pushInProgress = true;
        try {
            await _runMigrationIfNeeded();

            const localData = CL_DATA.exportAll();
            const customers = localData.customers || [];
            const jobs = localData.jobs || [];
            const deletedCustomers = localData.deletedCustomers || [];
            const deletedJobs = localData.deletedJobs || [];

            await Promise.all([
                _syncCollection('customers', customers, deletedCustomers),
                _syncCollection('jobs', jobs, deletedJobs)
            ]);

            const userRef = db.collection('users').doc(currentUser.uid);
            await userRef.set({
                deletedCustomers,
                deletedJobs,
                settings: JSON.parse(localStorage.getItem('cl-settings') || '{}'),
                migrationVersion: MIGRATION_VERSION,
                lastSync: firebase.firestore.FieldValue.serverTimestamp(),
                lastDevice: getDeviceId()
            }, { merge: true });

            console.log('Data synced to cloud');
            return true;
        } catch (err) {
            const code = err && (err.code || err.name) || 'unknown';
            const msg = err && err.message || String(err);
            console.error('[CL_FIREBASE] syncToCloud failed:', code, msg, err);
            if (typeof window !== 'undefined' && typeof showToast === 'function') {
                try { showToast('Cloud sync failed: ' + code, 'error'); } catch (_) {}
            }
            try {
                window.dispatchEvent(new CustomEvent('cl-sync-error', {
                    detail: { phase: 'push', code, message: msg }
                }));
            } catch (_) {}
            return false;
        } finally {
            pushInProgress = false;
            if (pushPending) {
                pushPending = false;
                setTimeout(syncToCloud, 50);
            }
        }
    }

    // Role-aware job fetch.
    //   Owner:   every job
    //   Manager: jobs where assignedManager == me OR createdBy == me
    //   Worker:  jobs where assignedTo == me OR createdBy == me
    // Firestore has no native OR across fields, so the non-owner cases
    // run two queries and dedupe by doc id.
    async function _fetchJobsForRole() {
        const uid = currentUser.uid;
        const role = (userProfile && userProfile.role) || 'worker';
        if (role === 'owner') {
            const snap = await db.collection('jobs').get();
            return snap.docs.map(d => d.data());
        }
        const queries = role === 'manager'
            ? [
                db.collection('jobs').where('assignedManager', '==', uid).get(),
                db.collection('jobs').where('createdBy', '==', uid).get()
              ]
            : [
                db.collection('jobs').where('assignedTo', '==', uid).get(),
                db.collection('jobs').where('createdBy', '==', uid).get()
              ];
        const snaps = await Promise.all(queries);
        const seen = new Set();
        const out = [];
        snaps.forEach(s => s.forEach(d => {
            if (seen.has(d.id)) return;
            seen.add(d.id);
            out.push(d.data());
        }));
        return out;
    }

    // Customers are readable by any authenticated user (rules enforce).
    async function _fetchAllCustomers() {
        const snap = await db.collection('customers').get();
        return snap.docs.map(d => d.data());
    }

    // Sync data from cloud. Pulls the per-user state doc plus the
    // role-appropriate set of jobs + all customers. Merge path into
    // CL_DATA is unchanged, so the rest of the app sees local arrays.
    async function syncFromCloud() {
        if (!currentUser || !db || pullInProgress) return false;

        pullInProgress = true;
        try {
            await _runMigrationIfNeeded();

            const userRef = db.collection('users').doc(currentUser.uid);
            const [userSnap, customers, jobs] = await Promise.all([
                userRef.get(),
                _fetchAllCustomers(),
                _fetchJobsForRole()
            ]);

            if (!userSnap.exists) {
                console.log('New user - uploading local data');
                await syncToCloud();
                return true;
            }

            const userData = userSnap.data();

            CL_DATA.mergeFromCloud({
                version: 2,
                customers,
                jobs,
                deletedCustomers: userData.deletedCustomers || [],
                deletedJobs: userData.deletedJobs || []
            });

            if (userData.settings) {
                const currentSettings = JSON.parse(localStorage.getItem('cl-settings') || '{}');
                userData.settings.firebaseConfig = currentSettings.firebaseConfig;
                userData.settings.gcalClientId = currentSettings.gcalClientId;
                localStorage.setItem('cl-settings', JSON.stringify(userData.settings));
            }

            localStorage.setItem('cl-last-sync', new Date().toISOString());
            console.log('Data synced from cloud');
            window.dispatchEvent(new CustomEvent('cl-sync-updated'));

            return true;
        } catch (err) {
            const code = err && (err.code || err.name) || 'unknown';
            const msg = err && err.message || String(err);
            console.error('[CL_FIREBASE] syncFromCloud failed:', code, msg, err);
            if (typeof window !== 'undefined' && typeof showToast === 'function') {
                try { showToast('Cloud pull failed: ' + code, 'error'); } catch (_) {}
            }
            try {
                window.dispatchEvent(new CustomEvent('cl-sync-error', {
                    detail: { phase: 'pull', code, message: msg }
                }));
            } catch (_) {}
            return false;
        } finally {
            pullInProgress = false;
        }
    }

    // Get unique device ID
    function getDeviceId() {
        let deviceId = localStorage.getItem('cl-device-id');
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('cl-device-id', deviceId);
        }
        return deviceId;
    }

    // Show sync toast notification
    function showSyncToast(message) {
        if (typeof showToast === 'function') {
            showToast(message);
        }
    }

    // Listen for online/offline
    window.addEventListener('online', () => {
        if (currentUser) {
            syncToCloud();
        }
    });

    // Auto-sync periodically when signed in
    setInterval(() => {
        if (currentUser && navigator.onLine) {
            syncFromCloud();
        }
    }, 5 * 1000);

    // Get the raw Firebase user object (needed for uid in Firestore queries)
    function getCurrentUser() {
        return currentUser;
    }

    // Get Firestore instance (initialized via init())
    function getFirestore() {
        return db;
    }

    // Phase 4: app-wide settings doc at `settings/global`.
    // Owner writes; any signed-in user reads. Used by the estimate form
    // to keep gas-price + chemical prices in sync without exposing the
    // gas-price field to non-Owner roles.
    async function getGlobalSettings() {
        if (!db) return null;
        try {
            const snap = await db.collection('settings').doc('global').get();
            return snap.exists ? snap.data() : {};
        } catch (err) {
            console.warn('[CL_FIREBASE] getGlobalSettings failed:', err);
            return null;
        }
    }

    async function updateGlobalSettings(patch) {
        if (!db || !userProfile || userProfile.role !== 'owner') {
            return { ok: false, code: 'not-owner' };
        }
        try {
            await db.collection('settings').doc('global').set(
                Object.assign({}, patch, { updatedAt: new Date().toISOString(), updatedBy: currentUser.uid }),
                { merge: true }
            );
            return { ok: true };
        } catch (err) {
            console.error('[CL_FIREBASE] updateGlobalSettings failed:', err);
            return { ok: false, code: err.code || 'unknown', message: err.message };
        }
    }

    // Convenience: check if the current user has a named permission flag.
    // Owner always returns true.
    function can(flag) {
        if (!userProfile) return false;
        if (userProfile.role === 'owner') return true;
        return !!(userProfile.permissions && userProfile.permissions[flag]);
    }

    // Public API
    return {
        init,
        isConfigured,
        signInWithGoogle,
        signInWithEmail,
        signOut,
        getUserInfo,
        getCurrentUser,
        getFirestore,
        syncToCloud,
        syncFromCloud,
        getCalendarToken,
        isCalendarConnected,
        getProfile: () => (userProfile ? Object.assign({}, userProfile) : null),
        getGlobalSettings,
        updateGlobalSettings,
        can,
        get isSignedIn() { return !!currentUser; },
        get user() { return getUserInfo(); },
        get role() { return userProfile ? userProfile.role : null; },
        get permissions() { return userProfile ? Object.assign({}, userProfile.permissions) : {}; }
    };
})();

// Auto-initialize if configured
document.addEventListener('DOMContentLoaded', () => {
    if (CL_FIREBASE.isConfigured()) {
        CL_FIREBASE.init();
    }
});