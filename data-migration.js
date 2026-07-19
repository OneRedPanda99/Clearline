/**
 * Clearline - Data Migration Script
 * Migrates combined customer/job records into separate data stores
 * Local storage with optional cloud sync
 */

// Declared with `var` so an accidental double-include (e.g. a page that
// references this script twice, or a service-worker race) doesn't throw a
// redeclaration SyntaxError and take down the entire page's JS.
/* eslint-disable no-var */
var CL_DATA = {
    CUSTOMERS_KEY: 'cl-customers',
    JOBS_KEY: 'cl-jobs',
    EXPENSES_KEY: 'cl-expenses',
    PAYROLL_KEY: 'cl-payroll',
    MIGRATED_KEY: 'cl-data-migrated-v2',
    DELETED_CUSTOMERS_KEY: 'cl-deleted-customers',
    DELETED_JOBS_KEY: 'cl-deleted-jobs',
    DELETED_EXPENSES_KEY: 'cl-deleted-expenses',
    DELETED_PAYROLL_KEY: 'cl-deleted-payroll',
    

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

    // Get all expenses
    getExpenses() {
        return this.safeParse(this.EXPENSES_KEY, []);
    },

    // Get all payroll entries
    getPayroll() {
        return this.safeParse(this.PAYROLL_KEY, []);
    },
    
    // Central cloud-sync trigger. Every write sink calls this so updates,
    // deletes, document attachments, and photo edits (not just adds) reach
    // Firebase. mergeFromCloud passes { skipSync: true } to avoid echoing the
    // cloud's own payload straight back.
    //
    // Debounced (200ms) so multi-step operations like deleteJob (which writes
    // saveJobs + saveDeletedJobs back-to-back) coalesce into a single cloud
    // upload. Without this, the second write would bail on syncToCloud's
    // in-progress guard, losing the tombstone from the winning snapshot.
    _syncTimer: null,
    _maybeSync(opts) {
        if (opts && opts.skipSync) return;
        if (typeof window === 'undefined') return;
        if (this._syncTimer) clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => {
            this._syncTimer = null;
            if (window.CL_FIREBASE && CL_FIREBASE.isSignedIn) {
                CL_FIREBASE.syncToCloud();
                return;
            }
            // Auth not ready yet. Poll for up to 10 seconds then sync
            let attempts = 0;
            const poll = setInterval(() => {
                attempts++;
                if (window.CL_FIREBASE && CL_FIREBASE.isSignedIn) {
                    clearInterval(poll);
                    CL_FIREBASE.syncToCloud();
                } else if (attempts >= 20) {
                    clearInterval(poll);
                }
            }, 500);
        }, 200);
    },

    // Save customers
    saveCustomers(customers, opts = {}) {
        localStorage.setItem(this.CUSTOMERS_KEY, JSON.stringify(customers));
        this._maybeSync(opts);
    },
    
    // Save jobs
    saveJobs(jobs, opts = {}) {
        localStorage.setItem(this.JOBS_KEY, JSON.stringify(jobs));
        this._maybeSync(opts);
    },

    // Save expenses
    saveExpenses(expenses, opts = {}) {
        localStorage.setItem(this.EXPENSES_KEY, JSON.stringify(expenses));
        this._maybeSync(opts);
    },

    // Save payroll entries
    savePayroll(payrollEntries, opts = {}) {
        localStorage.setItem(this.PAYROLL_KEY, JSON.stringify(payrollEntries));
        this._maybeSync(opts);
    },

    // Deleted tombstones
    getDeletedCustomers() {
        return this.safeParse(this.DELETED_CUSTOMERS_KEY, []);
    },
    getDeletedJobs() {
        return this.safeParse(this.DELETED_JOBS_KEY, []);
    },
    getDeletedExpenses() {
        return this.safeParse(this.DELETED_EXPENSES_KEY, []);
    },
    getDeletedPayroll() {
        return this.safeParse(this.DELETED_PAYROLL_KEY, []);
    },
    saveDeletedCustomers(deleted, opts = {}) {
        localStorage.setItem(this.DELETED_CUSTOMERS_KEY, JSON.stringify(deleted));
        this._maybeSync(opts);
    },
    saveDeletedJobs(deleted, opts = {}) {
        localStorage.setItem(this.DELETED_JOBS_KEY, JSON.stringify(deleted));
        this._maybeSync(opts);
    },
    saveDeletedExpenses(deleted, opts = {}) {
        localStorage.setItem(this.DELETED_EXPENSES_KEY, JSON.stringify(deleted));
        this._maybeSync(opts);
    },
    saveDeletedPayroll(deleted, opts = {}) {
        localStorage.setItem(this.DELETED_PAYROLL_KEY, JSON.stringify(deleted));
        this._maybeSync(opts);
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
    
    // Add a customer. saveCustomers now fires the cloud sync itself.
    addCustomer(customer) {
        const customers = this.getCustomers();
        customers.push(customer);
        this.saveCustomers(customers);
        return customer;
    },

    addJob(job) {
        const jobs = this.getJobs();
        jobs.push(job);
        this.saveJobs(jobs);
        return job;
    },

    addExpense(expense) {
        const expenses = this.getExpenses();
        expenses.push(expense);
        this.saveExpenses(expenses);
        return expense;
    },

    addPayrollEntry(entry) {
        const payroll = this.getPayroll();
        payroll.push(entry);
        this.savePayroll(payroll);
        return entry;
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

    updateExpense(id, updates) {
        const expenses = this.getExpenses();
        const index = expenses.findIndex(e => e.id === id);
        if (index >= 0) {
            expenses[index] = { ...expenses[index], ...updates, lastUpdated: new Date().toISOString() };
            this.saveExpenses(expenses);
            return expenses[index];
        }
        return null;
    },

    updatePayrollEntry(id, updates) {
        const payroll = this.getPayroll();
        const index = payroll.findIndex(e => e.id === id);
        if (index >= 0) {
            payroll[index] = { ...payroll[index], ...updates, lastUpdated: new Date().toISOString() };
            this.savePayroll(payroll);
            return payroll[index];
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

    deleteExpense(id) {
        const expenses = this.getExpenses().filter(e => e.id !== id);
        this.saveExpenses(expenses);
        const deleted = this.addTombstone(this.getDeletedExpenses(), id);
        this.saveDeletedExpenses(deleted);
    },

    deletePayrollEntry(id) {
        const payroll = this.getPayroll().filter(e => e.id !== id);
        this.savePayroll(payroll);
        const deleted = this.addTombstone(this.getDeletedPayroll(), id);
        this.saveDeletedPayroll(deleted);
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
        localStorage.removeItem(this.EXPENSES_KEY);
        localStorage.removeItem(this.PAYROLL_KEY);
        localStorage.removeItem(this.MIGRATED_KEY);
        localStorage.removeItem(this.DELETED_CUSTOMERS_KEY);
        localStorage.removeItem(this.DELETED_JOBS_KEY);
        localStorage.removeItem(this.DELETED_EXPENSES_KEY);
        localStorage.removeItem(this.DELETED_PAYROLL_KEY);
    },
    
    // Export all data
    exportAll() {
        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            customers: this.getCustomers(),
            jobs: this.getJobs(),
            expenses: this.getExpenses(),
            payroll: this.getPayroll(),
            deletedCustomers: this.getDeletedCustomers(),
            deletedJobs: this.getDeletedJobs(),
            deletedExpenses: this.getDeletedExpenses(),
            deletedPayroll: this.getDeletedPayroll()
        };
    },
    
    // Import data
    importData(data) {
        if (data.version === 2) {
            // New format
            if (data.customers) this.saveCustomers(data.customers);
            if (data.jobs) this.saveJobs(data.jobs);
            if (data.expenses) this.saveExpenses(data.expenses);
            if (data.payroll) this.savePayroll(data.payroll);
            if (data.deletedCustomers) this.saveDeletedCustomers(data.deletedCustomers);
            if (data.deletedJobs) this.saveDeletedJobs(data.deletedJobs);
            if (data.deletedExpenses) this.saveDeletedExpenses(data.deletedExpenses);
            if (data.deletedPayroll) this.saveDeletedPayroll(data.deletedPayroll);
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
        const localExpenses = this.getExpenses();
        const localPayroll = this.getPayroll();
        const localDeletedCustomers = this.getDeletedCustomers();
        const localDeletedJobs = this.getDeletedJobs();
        const localDeletedExpenses = this.getDeletedExpenses();
        const localDeletedPayroll = this.getDeletedPayroll();

        const remoteDeletedCustomers = Array.isArray(data.deletedCustomers) ? data.deletedCustomers : [];
        const remoteDeletedJobs = Array.isArray(data.deletedJobs) ? data.deletedJobs : [];
        const remoteDeletedExpenses = Array.isArray(data.deletedExpenses) ? data.deletedExpenses : [];
        const remoteDeletedPayroll = Array.isArray(data.deletedPayroll) ? data.deletedPayroll : [];

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
        const mergedDeletedExpenses = mergeTombstones(localDeletedExpenses, remoteDeletedExpenses);
        const mergedDeletedPayroll = mergeTombstones(localDeletedPayroll, remoteDeletedPayroll);

        const deletedCustomerMap = new Map(mergedDeletedCustomers.map(d => [d.id, d.deletedAt || 0]));
        const deletedJobMap = new Map(mergedDeletedJobs.map(d => [d.id, d.deletedAt || 0]));
        const deletedExpenseMap = new Map(mergedDeletedExpenses.map(d => [d.id, d.deletedAt || 0]));
        const deletedPayrollMap = new Map(mergedDeletedPayroll.map(d => [d.id, d.deletedAt || 0]));

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
        const remoteExpenses = Array.isArray(data.expenses) ? data.expenses : [];
        const remotePayroll = Array.isArray(data.payroll) ? data.payroll : [];

        const mergedCustomers = mergeRecords(localCustomers, remoteCustomers, deletedCustomerMap);
        const mergedJobs = mergeRecords(localJobs, remoteJobs, deletedJobMap);
        const mergedExpenses = mergeRecords(localExpenses, remoteExpenses, deletedExpenseMap);
        const mergedPayroll = mergeRecords(localPayroll, remotePayroll, deletedPayrollMap);

        // Avoid unnecessary localStorage writes + UI rerenders when the cloud
        // payload is identical to what we already have locally. Frequent pulls
        // (realtime listeners, polling, tab focus) can otherwise cause visible
        // flicker when pages rebuild lists on `cl-sync-updated`.
        const sigList = (list, pick) => {
            if (!Array.isArray(list) || list.length === 0) return '0';
            const rows = [];
            for (const it of list) {
                if (!it || !it.id) continue;
                rows.push(pick(it));
            }
            rows.sort();
            return rows.join('|');
        };
        const sigRecords = (list) => sigList(list, (it) => {
            const ts = it.lastUpdated ? (Date.parse(it.lastUpdated) || 0) : 0;
            return `${String(it.id)}@${ts}`;
        });
        const sigTombstones = (list) => sigList(list, (it) => `${String(it.id)}@${Number(it.deletedAt || 0)}`);

        const before = [
            sigRecords(localCustomers),
            sigRecords(localJobs),
            sigRecords(localExpenses),
            sigRecords(localPayroll),
            sigTombstones(localDeletedCustomers),
            sigTombstones(localDeletedJobs),
            sigTombstones(localDeletedExpenses),
            sigTombstones(localDeletedPayroll)
        ].join('~~');
        const after = [
            sigRecords(mergedCustomers),
            sigRecords(mergedJobs),
            sigRecords(mergedExpenses),
            sigRecords(mergedPayroll),
            sigTombstones(mergedDeletedCustomers),
            sigTombstones(mergedDeletedJobs),
            sigTombstones(mergedDeletedExpenses),
            sigTombstones(mergedDeletedPayroll)
        ].join('~~');

        if (before !== after) {
            this.saveDeletedCustomers(mergedDeletedCustomers, { skipSync: true });
            this.saveDeletedJobs(mergedDeletedJobs, { skipSync: true });
            this.saveDeletedExpenses(mergedDeletedExpenses, { skipSync: true });
            this.saveDeletedPayroll(mergedDeletedPayroll, { skipSync: true });
            this.saveCustomers(mergedCustomers, { skipSync: true });
            this.saveJobs(mergedJobs, { skipSync: true });
            this.saveExpenses(mergedExpenses, { skipSync: true });
            this.savePayroll(mergedPayroll, { skipSync: true });
            localStorage.setItem(this.MIGRATED_KEY, 'true');
            if (typeof window !== 'undefined') {
                try {
                    window.dispatchEvent(new CustomEvent('cl-sync-updated', {
                        detail: { source: 'cloud', changed: true }
                    }));
                } catch (e) {
                    // ignore event errors
                }
            }
        } else {
            // Still mark migrated so a fresh device doesn't keep re-running the legacy migration.
            localStorage.setItem(this.MIGRATED_KEY, 'true');
            if (typeof window !== 'undefined') {
                try {
                    window.dispatchEvent(new CustomEvent('cl-sync-updated', {
                        detail: { source: 'cloud', changed: false }
                    }));
                } catch (e) {
                    // ignore event errors
                }
            }
        }
    },
    
};

// Auto-run migration when script loads
if (typeof window !== 'undefined') {
    CL_DATA.migrate();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(r => r.unregister());
        });
    }
}