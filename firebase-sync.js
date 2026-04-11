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
    let syncInProgress = false;

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

    // Handle auth state changes
    function handleAuthStateChange(user) {
        currentUser = user;
        
        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('cl-auth-change', { 
            detail: { user: user ? getUserInfo() : null }
        }));

        if (user) {
            console.log('User signed in:', user.email);
            // Trigger sync when user signs in
            syncFromCloud();
        } else {
            console.log('User signed out');
        }
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

    // Sync data to cloud
    async function syncToCloud() {
        if (!currentUser || !db || syncInProgress) return false;

        syncInProgress = true;
        try {
            const userDoc = db.collection('users').doc(currentUser.uid);
            
            // Get local data
            const localData = CL_DATA.exportAll();
            localData.lastSync = new Date().toISOString();
            localData.deviceId = getDeviceId();

            // Save to Firestore
            await userDoc.set({
                customers: localData.customers || [],
                jobs: localData.jobs || [],
                settings: JSON.parse(localStorage.getItem('cl-settings') || '{}'),
                lastSync: firebase.firestore.FieldValue.serverTimestamp(),
                lastDevice: getDeviceId()
            }, { merge: true });

            console.log('Data synced to cloud');
            showSyncToast('Data synced to cloud');
            return true;
        } catch (err) {
            console.error('Sync to cloud failed:', err);
            return false;
        } finally {
            syncInProgress = false;
        }
    }

    // Sync data from cloud
    async function syncFromCloud() {
        if (!currentUser || !db || syncInProgress) return false;

        syncInProgress = true;
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            
            if (!userDoc.exists) {
                // First time user - upload local data
                console.log('New user - uploading local data');
                await syncToCloud();
                return true;
            }

            const cloudData = userDoc.data();
            const localData = CL_DATA.exportAll();

            // Simple conflict resolution: cloud wins if newer
            // In production, you'd want smarter merging
            const cloudTime = cloudData.lastSync?.toDate?.() || new Date(0);
            const localTime = new Date(localStorage.getItem('cl-last-sync') || 0);

            if (cloudTime > localTime) {
                // Cloud is newer - import it
                CL_DATA.importData({
                    customers: cloudData.customers || [],
                    jobs: cloudData.jobs || []
                });

                if (cloudData.settings) {
                    const currentSettings = JSON.parse(localStorage.getItem('cl-settings') || '{}');
                    // Preserve local-only settings
                    cloudData.settings.firebaseConfig = currentSettings.firebaseConfig;
                    cloudData.settings.gcalClientId = currentSettings.gcalClientId;
                    localStorage.setItem('cl-settings', JSON.stringify(cloudData.settings));
                }

                localStorage.setItem('cl-last-sync', new Date().toISOString());
                console.log('Data synced from cloud');
                showSyncToast('Data synced from cloud');
                
                // Notify UI to refresh
                window.dispatchEvent(new CustomEvent('cl-sync-updated'));
            } else {
                console.log('Local data is current');
            }

            return true;
        } catch (err) {
            console.error('Sync from cloud failed:', err);
            return false;
        } finally {
            syncInProgress = false;
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
            syncToCloud();
        }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Get the raw Firebase user object (needed for uid in Firestore queries)
    function getCurrentUser() {
        return currentUser;
    }

    // Get Firestore instance (initialized via init())
    function getFirestore() {
        return db;
    }

    // Public API
    return {
        init,
        isConfigured,
        signInWithGoogle,
        signOut,
        getUserInfo,
        getCurrentUser,
        getFirestore,
        syncToCloud,
        syncFromCloud,
        getCalendarToken,
        isCalendarConnected,
        get isSignedIn() { return !!currentUser; },
        get user() { return getUserInfo(); }
    };
})();

// Auto-initialize if configured
document.addEventListener('DOMContentLoaded', () => {
    if (CL_FIREBASE.isConfigured()) {
        CL_FIREBASE.init();
    }
});