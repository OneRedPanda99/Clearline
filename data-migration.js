/**
 * Clearline - Data Migration Script
 * Migrates combined customer/job records into separate data stores
 * Local storage with optional cloud sync
 */

const CL_DATA = {
    CUSTOMERS_KEY: 'cl-customers',
    JOBS_KEY: 'cl-jobs',
    MIGRATED_KEY: 'cl-data-migrated-v2',
    SYNC_CONFIG_KEY: 'cl-sync-config',
    SYNC_ENABLED_KEY: 'cl-sync-enabled',
    LAST_SYNC_KEY: 'cl-sync-last',
    SYNC_LOG_KEY: 'cl-sync-log',
    SYNC_STATUS_KEY: 'cl-sync-status',
    SYNC_CLIENT_ID_KEY: 'cl-sync-client-id',
    DELETED_CUSTOMERS_KEY: 'cl-deleted-customers',
    DELETED_JOBS_KEY: 'cl-deleted-jobs',
    
    _syncTimer: null,
    _firebaseReady: null,
    _db: null,
    _ref: null,

    // Diagnostics helpers
    getClientId() {
        let id = localStorage.getItem(this.SYNC_CLIENT_ID_KEY);
        if (!id) {
            id = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            localStorage.setItem(this.SYNC_CLIENT_ID_KEY, id);
        }
        return id;
    },

    logSync(event, details = '') {
        try {
            const log = JSON.parse(localStorage.getItem(this.SYNC_LOG_KEY) || '[]');
            log.unshift({
                ts: Date.now(),
                event,
                details: typeof details === 'string' ? details : JSON.stringify(details)
            });
            localStorage.setItem(this.SYNC_LOG_KEY, JSON.stringify(log.slice(0, 50)));
        } catch (e) {
            // ignore logging errors
        }
    },

    setSyncStatus(partial) {
        try {
            const current = JSON.parse(localStorage.getItem(this.SYNC_STATUS_KEY) || '{}');
            const next = { ...current, ...partial, updatedAt: Date.now() };
            localStorage.setItem(this.SYNC_STATUS_KEY, JSON.stringify(next));
        } catch (e) {
            // ignore status errors
        }
    },

    getSyncStatus() {
        try {
            return JSON.parse(localStorage.getItem(this.SYNC_STATUS_KEY) || '{}');
        } catch {
            return {};
        }
    },

    getSyncLog() {
        try {
            return JSON.parse(localStorage.getItem(this.SYNC_LOG_KEY) || '[]');
        } catch {
            return [];
        }
    },

    clearSyncLog() {
        localStorage.removeItem(this.SYNC_LOG_KEY);
    },

    safeParse(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            try {
                this.logSync('parse_error', { key, error: e.message || String(e) });
            } catch {
                // ignore logging errors
            }
            return fallback;
        }
    },
    
    // Get all customers
    getCustomers() {
        return this.safeParse(this.CUSTOMERS_KEY, []);
    },
    
    // Get all jobs
    getJobs() {
        return this.safeParse(this.JOBS_KEY, []);
    },
    
    // Save customers
    saveCustomers(customers, opts = {}) {
        localStorage.setItem(this.CUSTOMERS_KEY, JSON.stringify(customers));
        if (!opts.skipSync) this.scheduleSync();
    },
    
    // Save jobs
    saveJobs(jobs, opts = {}) {
        localStorage.setItem(this.JOBS_KEY, JSON.stringify(jobs));
        if (!opts.skipSync) this.scheduleSync();
    },

    // Deleted tombstones
    getDeletedCustomers() {
        return this.safeParse(this.DELETED_CUSTOMERS_KEY, []);
    },
    getDeletedJobs() {
        return this.safeParse(this.DELETED_JOBS_KEY, []);
    },
    saveDeletedCustomers(deleted, opts = {}) {
        localStorage.setItem(this.DELETED_CUSTOMERS_KEY, JSON.stringify(deleted));
        if (!opts.skipSync) this.scheduleSync();
    },
    saveDeletedJobs(deleted, opts = {}) {
        localStorage.setItem(this.DELETED_JOBS_KEY, JSON.stringify(deleted));
        if (!opts.skipSync) this.scheduleSync();
    },
    addTombstone(list, id) {
        const now = Date.now();
        const existing = list.find(d => d.id === id);
        if (existing) {
            existing.deletedAt = Math.max(existing.deletedAt || 0, now);
        } else {
            list.push({ id, deletedAt: now });
        }
        return list;
    },
    
    // Add a customer
    addCustomer(customer) {
        const customers = this.getCustomers();
        customers.push(customer);
        this.saveCustomers(customers);
        return customer;
    },
    
    // Add a job
    addJob(job) {
        const jobs = this.getJobs();
        jobs.push(job);
        this.saveJobs(jobs);
        return job;
    },
    
    // Update a customer
    updateCustomer(id, updates) {
        const customers = this.getCustomers();
        const index = customers.findIndex(c => c.id === id);
        if (index >= 0) {
            customers[index] = { ...customers[index], ...updates, lastUpdated: new Date().toISOString() };
            this.saveCustomers(customers);
            return customers[index];
        }
        return null;
    },
    
    // Update a job
    updateJob(id, updates) {
        const jobs = this.getJobs();
        const index = jobs.findIndex(j => j.id === id);
        if (index >= 0) {
            jobs[index] = { ...jobs[index], ...updates, lastUpdated: new Date().toISOString() };
            this.saveJobs(jobs);
            return jobs[index];
        }
        return null;
    },
    
    // Delete a customer
    deleteCustomer(id) {
        const customers = this.getCustomers().filter(c => c.id !== id);
        this.saveCustomers(customers);
        const deleted = this.addTombstone(this.getDeletedCustomers(), id);
        this.saveDeletedCustomers(deleted);
    },
    
    // Delete a job
    deleteJob(id) {
        const jobs = this.getJobs().filter(j => j.id !== id);
        this.saveJobs(jobs);
        const deleted = this.addTombstone(this.getDeletedJobs(), id);
        this.saveDeletedJobs(deleted);
    },
    
    // Find customer by ID
    findCustomer(id) {
        return this.getCustomers().find(c => c.id === id);
    },
    
    // Find job by ID
    findJob(id) {
        return this.getJobs().find(j => j.id === id);
    },
    
    // Get jobs for a customer
    getJobsForCustomer(customerId) {
        return this.getJobs().filter(j => j.customerId === customerId);
    },
    
    // Find or create customer by name+phone
    findOrCreateCustomer(name, phone, email = '', address = '') {
        if (!name) return null;
        
        const customers = this.getCustomers();
        // Try to match by name+phone
        let customer = customers.find(c => 
            c.name.toLowerCase() === name.toLowerCase() && 
            (c.phone === phone || (!c.phone && !phone))
        );
        
        if (!customer) {
            customer = {
                id: 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: name,
                phone: phone || '',
                email: email || '',
                address: address || '',
                notes: '',
                dateAdded: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };
            customers.push(customer);
            this.saveCustomers(customers);
        }
        
        return customer;
    },
    
    // Run migration from old combined format
    migrate() {
        // Already migrated?
        if (localStorage.getItem(this.MIGRATED_KEY)) {
            return false;
        }
        
        const oldData = this.safeParse(this.CUSTOMERS_KEY, []);
        
        // Check if data looks like old format (has jobDate or serviceType at root level)
        const needsMigration = oldData.some(record => 
            record.jobDate || record.serviceType || record.status === 'scheduled' || record.status === 'completed'
        );
        
        if (!needsMigration || oldData.length === 0) {
            localStorage.setItem(this.MIGRATED_KEY, 'true');
            return false;
        }
        
        console.log('Running PPW data migration...');
        
        const customers = [];
        const jobs = [];
        const customerMap = new Map(); // name+phone -> customer
        
        oldData.forEach(record => {
            // Create/find customer
            const customerKey = `${record.name?.toLowerCase() || ''}_${record.phone || ''}`;
            let customer = customerMap.get(customerKey);
            
            if (!customer && record.name) {
                customer = {
                    id: 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    name: record.name,
                    phone: record.phone || '',
                    email: record.email || '',
                    address: record.address || '',
                    notes: '',
                    dateAdded: record.dateAdded || new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };
                customers.push(customer);
                customerMap.set(customerKey, customer);
            }
            
            // Create job if there's job data
            const hasJobData = record.jobDate || record.serviceType || record.quoteAmount || 
                              record.status === 'scheduled' || record.status === 'completed' || record.status === 'quoted';
            
            if (hasJobData) {
                const job = {
                    id: 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    customerId: customer?.id || null,
                    customerName: record.name || '',
                    customerPhone: record.phone || '',
                    address: record.address || '',
                    serviceType: record.serviceType || '',
                    jobDate: record.jobDate || '',
                    jobTime: record.jobTime || '',
                    jobDuration: record.jobDuration || '',
                    quoteAmount: record.quoteAmount || '',
                    squareFootage: record.squareFootage || '',
                    status: record.status || 'new',
                    notes: record.notes || '',
                    waiverSigned: record.waiverSigned || false,
                    beforePhotos: record.beforePhotos || [],
                    afterPhotos: record.afterPhotos || [],
                    googleEventId: record.googleEventId || null,
                    followUpDate: record.followUpDate || '',
                    dateAdded: record.dateAdded || new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };
                jobs.push(job);
            }
        });
        
        // Save migrated data
        this.saveCustomers(customers);
        this.saveJobs(jobs);
        localStorage.setItem(this.MIGRATED_KEY, 'true');
        
        console.log(`Migration complete: ${customers.length} customers, ${jobs.length} jobs`);
        return true;
    },
    
    // Clear all data
    clearAll() {
        localStorage.removeItem(this.CUSTOMERS_KEY);
        localStorage.removeItem(this.JOBS_KEY);
        localStorage.removeItem(this.MIGRATED_KEY);
    },
    
    // Export all data
    exportAll() {
        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            customers: this.getCustomers(),
            jobs: this.getJobs(),
            deletedCustomers: this.getDeletedCustomers(),
            deletedJobs: this.getDeletedJobs()
        };
    },
    
    // Import data
    importData(data) {
        if (data.version === 2) {
            // New format
            if (data.customers) this.saveCustomers(data.customers);
            if (data.jobs) this.saveJobs(data.jobs);
            if (data.deletedCustomers) this.saveDeletedCustomers(data.deletedCustomers);
            if (data.deletedJobs) this.saveDeletedJobs(data.deletedJobs);
            localStorage.setItem(this.MIGRATED_KEY, 'true');
        } else {
            // Old format - save and run migration
            localStorage.removeItem(this.MIGRATED_KEY);
            this.saveCustomers(data.customers || data);
            this.migrate();
        }
    },

    // Merge cloud data without overwriting newer local changes
    mergeFromCloud(data) {
        if (!data) return;
        const localCustomers = this.getCustomers();
        const localJobs = this.getJobs();
        const localDeletedCustomers = this.getDeletedCustomers();
        const localDeletedJobs = this.getDeletedJobs();

        const remoteDeletedCustomers = Array.isArray(data.deletedCustomers) ? data.deletedCustomers : [];
        const remoteDeletedJobs = Array.isArray(data.deletedJobs) ? data.deletedJobs : [];

        const mergeTombstones = (localList, remoteList) => {
            const map = new Map();
            localList.forEach(d => map.set(d.id, d));
            remoteList.forEach(d => {
                const existing = map.get(d.id);
                if (!existing || (d.deletedAt || 0) > (existing.deletedAt || 0)) {
                    map.set(d.id, d);
                }
            });
            return Array.from(map.values());
        };

        const mergedDeletedCustomers = mergeTombstones(localDeletedCustomers, remoteDeletedCustomers);
        const mergedDeletedJobs = mergeTombstones(localDeletedJobs, remoteDeletedJobs);

        const deletedCustomerMap = new Map(mergedDeletedCustomers.map(d => [d.id, d.deletedAt || 0]));
        const deletedJobMap = new Map(mergedDeletedJobs.map(d => [d.id, d.deletedAt || 0]));

        const mergeRecords = (localList, remoteList, deletedMap) => {
            const map = new Map();
            localList.forEach(item => map.set(item.id, item));
            remoteList.forEach(item => {
                if (!item || !item.id) return;
                const deletedAt = deletedMap.get(item.id) || 0;
                const remoteUpdated = item.lastUpdated ? Date.parse(item.lastUpdated) : 0;
                if (deletedAt && deletedAt >= remoteUpdated) return;

                const local = map.get(item.id);
                const localUpdated = local && local.lastUpdated ? Date.parse(local.lastUpdated) : 0;
                if (!local || remoteUpdated > localUpdated) {
                    map.set(item.id, item);
                }
            });

            // Remove any locally deleted records
            deletedMap.forEach((deletedAt, id) => {
                const local = map.get(id);
                const localUpdated = local && local.lastUpdated ? Date.parse(local.lastUpdated) : 0;
                if (deletedAt >= localUpdated) {
                    map.delete(id);
                }
            });
            return Array.from(map.values());
        };

        const remoteCustomers = Array.isArray(data.customers) ? data.customers : [];
        const remoteJobs = Array.isArray(data.jobs) ? data.jobs : [];

        const mergedCustomers = mergeRecords(localCustomers, remoteCustomers, deletedCustomerMap);
        const mergedJobs = mergeRecords(localJobs, remoteJobs, deletedJobMap);

        this.saveDeletedCustomers(mergedDeletedCustomers, { skipSync: true });
        this.saveDeletedJobs(mergedDeletedJobs, { skipSync: true });
        this.saveCustomers(mergedCustomers, { skipSync: true });
        this.saveJobs(mergedJobs, { skipSync: true });
        localStorage.setItem(this.MIGRATED_KEY, 'true');
        if (typeof window !== 'undefined') {
            try {
                window.dispatchEvent(new CustomEvent('cl-sync-updated', { detail: { source: 'cloud' } }));
            } catch (e) {
                // ignore event errors
            }
        }
    },
    
    // ===== Cloud Sync (Firebase Realtime Database) =====
    getSyncConfig() {
        try {
            return JSON.parse(localStorage.getItem(this.SYNC_CONFIG_KEY) || 'null');
        } catch {
            return null;
        }
    },
    
    setSyncConfig(config) {
        localStorage.setItem(this.SYNC_CONFIG_KEY, JSON.stringify(config));
    },
    
    isSyncEnabled() {
        return localStorage.getItem(this.SYNC_ENABLED_KEY) === 'true';
    },
    
    async enableSync() {
        localStorage.setItem(this.SYNC_ENABLED_KEY, 'true');
        const ready = await this.initCloudSync();
        if (ready) {
            await this.pushToCloud();
        }
        return ready;
    },
    
    disableSync() {
        localStorage.removeItem(this.SYNC_ENABLED_KEY);
        if (this._ref) this._ref.off();
        this._ref = null;
        this._db = null;
        this.setSyncStatus({ status: 'disabled' });
        this.logSync('disabled');
    },
    
    async initCloudSync() {
        const config = this.getSyncConfig();
        if (!config || !this.isSyncEnabled()) return false;
        if (typeof window === 'undefined') return false;

        const syncKey = (config.syncKey || '').trim();
        if (!syncKey || !config.apiKey || !config.projectId || !config.databaseURL) {
            this.logSync('init_fail', 'missing_config');
            this.setSyncStatus({ status: 'config_missing' });
            return false;
        }

        this.logSync('init_start');
        this.setSyncStatus({ status: 'init' });
        try {
            await this.loadFirebaseSDK();
        } catch (err) {
            this.logSync('sdk_error', err.message || err);
            this.setSyncStatus({ status: 'sdk_error', lastError: err.message || String(err) });
            return false;
        }
        if (!window.firebase) {
            this.logSync('sdk_missing', 'firebase_not_found');
            this.setSyncStatus({ status: 'sdk_missing' });
            return false;
        }
        
        const fbConfig = {
            apiKey: config.apiKey,
            authDomain: config.authDomain || (config.projectId ? `${config.projectId}.firebaseapp.com` : undefined),
            projectId: config.projectId,
            databaseURL: config.databaseURL
        };
        
        if (!firebase.apps.length) {
            firebase.initializeApp(fbConfig);
            this.logSync('app_init');
        }

        try {
            const auth = firebase.auth();
            if (!auth.currentUser) {
                await auth.signInAnonymously();
            }
            if (auth.currentUser) {
                let token = null;
                try {
                    token = await auth.currentUser.getIdToken();
                } catch (e) {
                    // ignore token errors
                }
                this.setSyncStatus({
                    authUid: auth.currentUser.uid,
                    authIsAnonymous: !!auth.currentUser.isAnonymous,
                    authToken: token || null,
                    authTokenTail: token ? token.slice(-8) : null,
                    provider: 'rtdb'
                });
                this.logSync('auth_ok', { uid: auth.currentUser.uid, anon: !!auth.currentUser.isAnonymous });
                if (token) this.logSync('token_saved');
            }
        } catch (err) {
            this.logSync('auth_error', err.message || err);
            this.setSyncStatus({ status: 'auth_error', lastError: err.message || String(err) });
            return false;
        }
        this._db = firebase.database();
        this._ref = this._db.ref(`cl-data/${syncKey}`);
        this.setSyncStatus({ status: 'ready', clientId: this.getClientId() });
        this.logSync('ref_ready', `cl-data/${syncKey}`);
        
        this.listenForRemoteChanges();
        await this.pullFromCloud();
        return true;
    },
    
    listenForRemoteChanges() {
        if (!this._ref) return;
        this._ref.on('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;
            const lastSync = parseInt(localStorage.getItem(this.LAST_SYNC_KEY) || '0', 10);
            const updatedAt = data.updatedAt || 0;
            if (updatedAt && updatedAt <= lastSync) return;
            
            this.mergeFromCloud(data);
            if (data.settings) {
                localStorage.setItem('cl-settings', JSON.stringify(data.settings));
            }
            localStorage.setItem(this.LAST_SYNC_KEY, String(updatedAt || Date.now()));
            this.setSyncStatus({ lastRemoteUpdateAt: updatedAt || Date.now() });
            this.logSync('remote_update', { updatedAt: updatedAt || Date.now() });
        });
    },
    
    async pullFromCloud() {
        if (!this._ref) return;
        try {
            const snapshot = await this._ref.get();
            if (!snapshot.exists()) {
                this.logSync('pull_empty');
                return;
            }
            const data = snapshot.val();
            const lastSync = parseInt(localStorage.getItem(this.LAST_SYNC_KEY) || '0', 10);
            const updatedAt = data.updatedAt || 0;
            if (updatedAt && updatedAt <= lastSync) return;
            
            this.mergeFromCloud(data);
            if (data.settings) {
                localStorage.setItem('cl-settings', JSON.stringify(data.settings));
            }
            localStorage.setItem(this.LAST_SYNC_KEY, String(updatedAt || Date.now()));
            this.setSyncStatus({ lastPullAt: Date.now() });
            this.logSync('pull_ok', { updatedAt: updatedAt || Date.now() });
        } catch (err) {
            this.logSync('pull_error', err.message || err);
            this.setSyncStatus({ lastError: err.message || String(err) });
        }
    },
    
    async pushToCloud() {
        if (!this.isSyncEnabled()) return;
        if (!this._ref) await this.initCloudSync();
        if (!this._ref) return;
        // Pre-merge remote data to avoid overwriting newer changes or deletions
        try {
            const snapshot = await this._ref.get();
            if (snapshot.exists()) {
                this.mergeFromCloud(snapshot.val());
                this.logSync('pre_merge');
            }
        } catch (err) {
            this.logSync('pre_merge_error', err.message || err);
        }

        const payload = this.exportAll();
        payload.settings = JSON.parse(localStorage.getItem('cl-settings') || '{}');
        payload.updatedAt = Date.now();
        
        try {
            await this._ref.set(payload);
            localStorage.setItem(this.LAST_SYNC_KEY, String(payload.updatedAt));
            this.setSyncStatus({ lastPushAt: Date.now(), lastError: null });
            this.logSync('push_ok', { customers: payload.customers?.length || 0, jobs: payload.jobs?.length || 0 });
        } catch (err) {
            this.logSync('push_error', err.message || err);
            this.setSyncStatus({ lastError: err.message || String(err) });
        }
    },
    
    scheduleSync() {
        if (!this.isSyncEnabled()) return;
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => this.pushToCloud(), 1200);
        this.logSync('sync_scheduled');
    },
    
    async syncNow() {
        await this.pushToCloud();
        await this.pullFromCloud();
    },

    async testCloudSync() {
        const ready = await this.initCloudSync();
        if (!ready || !this._db) {
            this.logSync('test_fail', 'init_failed');
            return { ok: false, error: 'init_failed' };
        }
        const config = this.getSyncConfig() || {};
        const syncKey = (config.syncKey || '').trim();
        if (!syncKey) {
            this.logSync('test_fail', 'missing_syncKey');
            return { ok: false, error: 'missing_syncKey' };
        }

        const clientId = this.getClientId();
        const debugRef = this._db.ref(`cl-debug/${syncKey}/${clientId}`);
        const payload = {
            clientId,
            ts: Date.now(),
            ua: navigator.userAgent || ''
        };
        try {
            await debugRef.set(payload);
            const snap = await debugRef.get();
            const ok = snap.exists();
            this.logSync('test_ok', ok ? 'read_back' : 'no_data');
            return { ok, data: snap.val() || null };
        } catch (err) {
            this.logSync('test_error', err.message || err);
            this.setSyncStatus({ lastError: err.message || String(err) });
            return { ok: false, error: err.message || String(err) };
        }
    },
    
    loadFirebaseSDK() {
        if (this._firebaseReady) return this._firebaseReady;
        this._firebaseReady = new Promise((resolve, reject) => {
            const loadScript = (src) => new Promise((res, rej) => {
                if (document.querySelector(`script[src="${src}"]`)) return res();
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => res();
                script.onerror = () => rej(new Error(`Failed to load ${src}`));
                document.head.appendChild(script);
            });
            
            loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js')
                .then(() => loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js'))
                .then(() => loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js'))
                .then(resolve)
                .catch(reject);
        });
        return this._firebaseReady;
    }
};

// Auto-run migration when script loads
if (typeof window !== 'undefined') {
    CL_DATA.migrate();
    if (CL_DATA.isSyncEnabled()) {
        CL_DATA.initCloudSync();
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}
