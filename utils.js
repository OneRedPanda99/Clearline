// ─── Clearline Shared Utilities ───────────────────────────────────
'use strict';

/** Unified Tailwind tokens. Load utils.js before cdn.tailwindcss.com */
window.tailwind = window.tailwind || {
  config: {
    theme: {
      extend: {
        colors: {
          /* Mapped to M3 Clearline roles in app.css */
          primary:   '#4f8cff',
          secondary: '#8ab4ff',
          dark:      '#1a1c1f',
          darker:    '#121417',
          accent:    '#4f8cff',
        }
      }
    }
  }
};

/**
 * Escape a value for safe interpolation into innerHTML. Neutralizes the
 * five characters that can break out of text/attribute context, so
 * customer-supplied data (names, notes, addresses, etc.) can never inject
 * markup or script. ALWAYS run user data through this before innerHTML.
 *
 * Usage inside a template literal:
 *   el.innerHTML = `<h3>${escapeHtml(customer.name)}</h3>`;
 */
window.escapeHtml = function(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Escape a value for use inside a URL query/attribute (tel:, mailto:, href).
 * Runs escapeHtml first (attribute-safe) then strips characters that could
 * break out of the URL. Use for phone/email/address in href attributes.
 */
window.escapeAttr = window.escapeHtml;

/**
 * Build the denormalized `accessUids` array for a job so the Firestore
 * read rule (uid() in resource.data.accessUids) is provable WITHOUT a
 * get()/exists() call. Firestore rejects any jobs query whose rule relies
 * on a get() lookup of the caller's user doc (the old isOwner()/isManager()/
 * isWorker() path), so we instead stamp every allowed reader's uid directly
 * onto the job: the company owner (from CL_SECRETS.ownerUid), the job's
 * creator, the assigned manager, the legacy single assignee, and every
 * worker in the assignedWorkers crew.
 *
 * Pass the job's CURRENT assigned fields (`existing`) when you are only
 * updating a subset (e.g. manager-panel reassign) so readers who were
 * already granted access aren't dropped — the rules require non-owner
 * updates to preserve the existing reader set.
 *
 * @param {object} fields  The assigned fields being written (any of
 *   assignedWorkers, assignedTo, assignedManager, createdBy).
 * @param {object} [existing] The job's previously-stored assigned fields,
 *   used to merge in currently-granted readers that aren't in `fields`.
 * @returns {string[]} array of unique uids (may be empty if nothing known).
 */
window.buildAccessUids = function(fields, existing) {
  const f = fields || {};
  const e = existing || {};
  const ownerUid = (window.CL_SECRETS && window.CL_SECRETS.ownerUid) || '';
  const set = new Set();
  if (ownerUid) set.add(ownerUid);
  [f.createdBy, e.createdBy, f.assignedManager, e.assignedManager,
   f.assignedTo, e.assignedTo].forEach(u => { if (u) set.add(u); });
  (Array.isArray(f.assignedWorkers) ? f.assignedWorkers : [])
    .concat(Array.isArray(e.assignedWorkers) ? e.assignedWorkers : [])
    .forEach(u => { if (u) set.add(u); });
  return Array.from(set);
};

/**
 * Safe localStorage read with JSON parsing.
 * Returns `defaultValue` if key is missing, null, or corrupt JSON.
 */
window.safeGet = function(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[safeGet] Failed to parse localStorage key "${key}":`, e);
    // Optionally wipe the corrupted key so it doesn't keep crashing
    localStorage.removeItem(key);
    return defaultValue;
  }
};

/**
 * Safe localStorage write with JSON serialization.
 * Returns true on success, false on failure.
 */
window.safeSet = function(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`[safeSet] Failed to write localStorage key "${key}":`, e);
    // Handle quota exceeded or private-mode restrictions gracefully
    showToast('Storage error. Data may not be saved.', 'error');
    return false;
  }
};

/**
 * Local YYYY-MM-DD (timezone-safe).
 * Avoids UTC `toISOString().split('T')[0]` off-by-one (shows tomorrow in evening).
 */
window.localYmd = function(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const yr = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const da = String(dt.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
};

/**
 * Safe localStorage remove.
 */
window.safeRemove = function(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[safeRemove] Failed to remove key "${key}":`, e);
  }
};

/**
 * Global toast notification system.
 * Usage: showToast('Job saved!') or showToast('Error!', 'error')
 * Types: 'success' (default) | 'error' | 'info'
 */
window.showToast = function(message, type = 'success') {
  const existing = document.getElementById('cl-inline-status');
  if (existing) existing.remove();
  const colors = {
    success: { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.45)', fg: '#d1fae5' },
    error:   { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.45)', fg: '#fecaca' },
    info:    { bg: 'rgba(59,130,246,0.18)', border: 'rgba(59,130,246,0.45)', fg: '#dbeafe' }
  };
  const c = colors[type] || colors.success;
  const bar = document.createElement('div');
  bar.id = 'cl-inline-status';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.textContent = String(message || '');
  Object.assign(bar.style, {
    position: 'fixed',
    top: '64px',
    left: '12px',
    right: '12px',
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.fg,
    padding: '10px 12px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '600',
    zIndex: '9999',
    boxShadow: '0 8px 20px rgba(0,0,0,0.25)'
  });
  document.body.appendChild(bar);
  setTimeout(() => {
    const n = document.getElementById('cl-inline-status');
    if (n) n.remove();
  }, 5000);
};

/**
 * Global sync-status badge. Renders a single small pill in the top-right that
 * reflects cloud sync state, so the user always knows their data is safe.
 * the #1 trust signal. Driven by the `cl-sync-state` events firebase-sync.js
 * emits ('saving' | 'saved' | 'offline' | 'error'). Auto-mounts on every page
 * that loads utils.js; no per-page markup required.
 */
(function initSyncBadge() {
  if (typeof window === 'undefined') return;

  const STATES = {
    saving:  { icon: 'fa-arrows-rotate fa-spin', text: 'Saving…',  color: '#38bdf8', bg: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.4)' },
    saved:   { icon: 'fa-circle-check',           text: 'Saved',    color: '#34d399', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.4)' },
    offline: { icon: 'fa-cloud-slash',            text: 'Offline',  color: '#fbbf24', bg: 'rgba(251,191,36,0.14)', border: 'rgba(251,191,36,0.4)' },
    error:   { icon: 'fa-triangle-exclamation',   text: 'Sync failed', color: '#f87171', bg: 'rgba(248,113,113,0.14)', border: 'rgba(248,113,113,0.4)' }
  };

  let badge = null;
  let hideTimer = null;

  function ensureBadge() {
    if (badge) return badge;
    badge = document.createElement('div');
    badge.id = 'cl-sync-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    Object.assign(badge.style, {
      position: 'fixed',
      bottom: 'calc(70px + env(safe-area-inset-bottom, 0px) + 10px)',
      left: '12px',
      display: 'none',
      alignItems: 'center',
      gap: '6px',
      padding: '5px 10px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: '600',
      zIndex: '9998',
      pointerEvents: 'none',
      transition: 'opacity 0.25s ease',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)'
    });
    document.body.appendChild(badge);
    return badge;
  }

  function show(state) {
    const cfg = STATES[state];
    if (!cfg) return;
    const el = ensureBadge();
    el.style.background = cfg.bg;
    el.style.border = `1px solid ${cfg.border}`;
    el.style.color = cfg.color;
    el.innerHTML = `<i class="fas ${cfg.icon}"></i><span>${cfg.text}</span>`;
    el.style.display = 'inline-flex';
    el.style.opacity = '1';
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    // 'saved' is a transient confirmation; the rest stay until state changes.
    if (state === 'saved') {
      hideTimer = setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => { el.style.display = 'none'; }, 260);
      }, 1600);
    }
  }

  window.addEventListener('cl-sync-state', (e) => {
    const state = e.detail && e.detail.state;
    if (state) show(state);
  });

  // Reflect a starting offline state immediately.
  window.addEventListener('DOMContentLoaded', () => {
    if (navigator && navigator.onLine === false) show('offline');
  });
})();

/**
 * Active nav tab highlighter. Call on every page.
 * Looks for <a> tags in .tab-bar and marks the one matching current URL.
 */
/**
 * The whole app's navigation, defined once.
 *
 * Every page carries an empty <nav class="tab-bar"></nav> and calls
 * setActiveNav(); the bar is rendered here so a tab can never exist on one
 * page and not another. Tabs a role can't use are not rendered at all —
 * a tab that does nothing is worse than a missing one.
 *
 * Pages that are not tabs (estimate, invoice, waiver, map, team, settings)
 * are reached from the thing they belong to, not from a menu of everything.
 */
window.CL_TABS = [
  { file: 'index.html',            label: 'Today',     icon: 'fa-house' },
  { file: 'jobs.html',             label: 'Jobs',      icon: 'fa-briefcase' },
  { file: 'calendar.html',         label: 'Schedule',  icon: 'fa-calendar-alt', perm: 'canViewCalendar' },
  { file: 'customer-tracker.html', label: 'Customers', icon: 'fa-users' },
  { file: 'money.html',            label: 'Money',     icon: 'fa-sack-dollar', ownerOnly: true }
];

window.clRole = function() {
  try {
    if (window.CL_FIREBASE && CL_FIREBASE.role) return CL_FIREBASE.role;
    return localStorage.getItem('cl-last-role') || null;
  } catch (_) { return null; }
};

/**
 * Does this user hold a permission flag? Owner and manager always do.
 * Reads the live profile unless one is passed in (the profile event beats
 * anything cached).
 */
window.clCan = function(flag, profile) {
  const p = profile || ((window.CL_FIREBASE && CL_FIREBASE.getProfile) ? CL_FIREBASE.getProfile() : null);
  const role = (p && p.role) || window.clRole();
  if (role === 'owner' || role === 'manager') return true;
  return !!(p && p.permissions && p.permissions[flag] === true);
};

window.renderTabBar = function(role, profile) {
  const nav = document.querySelector('.tab-bar');
  if (!nav) return;
  const filename = (window.location.pathname.split('/').pop() || 'index.html');
  const effectiveRole = role || window.clRole();
  const isOwner = effectiveRole === 'owner';
  const tabs = window.CL_TABS.filter(t => {
    if (t.ownerOnly && !isOwner) return false;
    // Never hide the tab you're standing on, or the bar loses its anchor.
    if (t.perm && t.file !== filename && !window.clCan(t.perm, profile)) return false;
    return true;
  });
  nav.innerHTML = '<div class="tab-bar-inner">' + tabs.map(t => {
    const active = t.file === filename || (filename === '' && t.file === 'index.html');
    return `<a href="${t.file}" class="tab-item${active ? ' active nav-active' : ''}"${active ? ' aria-current="page"' : ''}>`
      + `<i class="fas ${t.icon}"></i><span>${t.label}</span></a>`;
  }).join('') + '</div>';
};

window.setActiveNav = function() {
  const nav = document.querySelector('.tab-bar');
  if (nav && !nav.querySelector('a')) {
    window.renderTabBar();
    return;
  }
  const path = window.location.pathname;
  const filename = path.split('/').pop() || 'index.html';
  document.querySelectorAll('.tab-bar a, .bottom-nav a').forEach(link => {
    const href = link.getAttribute('href') || '';
    const linkFile = href.split('/').pop();
    if (linkFile === filename || (filename === '' && linkFile === 'index.html')) {
      link.classList.add('nav-active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('nav-active');
      link.removeAttribute('aria-current');
    }
  });
};

// The profile arrives after first paint, so re-render once we know the role.
// Trust the event's own profile over the cached role.
window.addEventListener('cl-profile-updated', (e) => {
  const profile = e && e.detail && e.detail.profile;
  window.renderTabBar(profile && profile.role, profile);
});

/**
 * Universal modal opener with focus trap + ESC close.
 * Usage: openModal('myModalId')
 */
window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('modal-open');
  modal.classList.add('show');
  document.body.classList.add('modal-open');
  document.body.style.overflow = 'hidden';

  // Focus first focusable element
  const focusable = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length) focusable[0].focus();

  // Focus trap
  modal._trapHandler = function(e) {
    if (e.key !== 'Tab') return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };

  // ESC close
  modal._escHandler = function(e) {
    if (e.key === 'Escape') closeModal(modalId);
  };

  modal.addEventListener('keydown', modal._trapHandler);
  document.addEventListener('keydown', modal._escHandler);

  // Backdrop click to close
  modal._backdropHandler = function(e) {
    if (e.target === modal) closeModal(modalId);
  };
  modal.addEventListener('click', modal._backdropHandler);
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.setAttribute('hidden', '');
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('modal-open');
  modal.classList.remove('show');
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';

  if (modal._trapHandler)    modal.removeEventListener('keydown', modal._trapHandler);
  if (modal._escHandler)     document.removeEventListener('keydown', modal._escHandler);
  if (modal._backdropHandler) modal.removeEventListener('click', modal._backdropHandler);
};

/**
 * Shared geolocation cache. Reuses coordinates across pages/loads for up to
 * 30 minutes so we don't spam the browser's permission prompt every time
 * jobs.html or map.html loads.
 *
 * Contract:
 *   getCachedLocation({ maxAgeMs = 30*60*1000, prompt = false })
 *     -> Promise<{lat, lng, ts} | null>
 *
 * - prompt=false (default): return the cached coords if fresh, else null.
 *   Never triggers a permission prompt. Safe to call on every page load.
 * - prompt=true: if cache is missing/expired, call
 *   navigator.geolocation.getCurrentPosition and persist the result.
 *   Resolves null on denial / unavailable / timeout.
 *
 * Cache key: localStorage['cl-user-location'] = { lat, lng, ts }
 */
window.CL_LOCATION_CACHE_KEY = 'cl-user-location';
window.getCachedLocation = function({ maxAgeMs = 30 * 60 * 1000, prompt = false } = {}) {
  return new Promise(resolve => {
    const now = Date.now();
    const cached = safeGet(window.CL_LOCATION_CACHE_KEY, null);
    if (cached && cached.lat != null && cached.lng != null &&
        typeof cached.ts === 'number' && (now - cached.ts) < maxAgeMs) {
      resolve(cached);
      return;
    }
    if (!prompt) { resolve(null); return; }
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        safeSet(window.CL_LOCATION_CACHE_KEY, loc);
        resolve(loc);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: maxAgeMs }
    );
  });
};

/**
 * Clear the cached location (e.g. for a "Re-locate" button).
 */
window.clearCachedLocation = function() {
  safeRemove(window.CL_LOCATION_CACHE_KEY);
};

/**
 * Legacy hook: we used to inject a 6th “Panel” tab for owners, which threw
 * off balance with the oversized center (+) button. Panel is available from
 * Home (owner tile), bookmarks, or manager-panel.html directly.
 * Only removes stale `[data-owner-panel]` nodes if any remain cached.
 */
window.__applyOwnerNav = function(_profile) {
  document.querySelectorAll('a[data-owner-panel]').forEach(el => el.remove());
};
window.addEventListener('cl-profile-updated', (e) => {
  try { window.__applyOwnerNav(e.detail && e.detail.profile); } catch (_) {}
});
document.addEventListener('DOMContentLoaded', () => {
  try {
    const p = (window.CL_FIREBASE && CL_FIREBASE.getProfile) ? CL_FIREBASE.getProfile() : null;
    if (p) window.__applyOwnerNav(p);
  } catch (_) {}
});

/**
 * Derive the financial value to display for a job. The legacy `quoteAmount`
 * field on the job itself is no longer the source of truth. Instead we
 * prefer the grand total stored on any linked invoice (highest priority)
 * or estimate (fallback) inside `job.documents`. This keeps job cards,
 * stat totals, and the Home "Estimated Total" in lockstep with whatever
 * amount the generator pages last saved, discounts and adjustments
 * included.
 *
 * Selection rules:
 *   - Invoices take priority over estimates (billed > proposed).
 *   - Within each kind, pick the most recently updated entry.
 *   - Fall back to parseFloat(job.quoteAmount) for jobs that have no
 *     linked documents yet.
 *   - Return 0 when nothing usable is present.
 */
// Internal raw computation; never reveal $ to non-Owner callers.
window._rawJobDisplayTotal = function(job) {
  if (!job) return 0;
  const docs = job.documents || {};
  const latest = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    let best = null;
    let bestTs = -Infinity;
    for (const d of arr) {
      if (!d) continue;
      const ts = Date.parse(d.updatedAt || d.createdAt || '') || 0;
      if (ts >= bestTs) { best = d; bestTs = ts; }
    }
    return best;
  };
  const pickTotal = (entry) => {
    if (!entry || !entry.summary) return null;
    const n = parseFloat(entry.summary.total);
    return isNaN(n) ? null : n;
  };

  const inv = pickTotal(latest(docs.invoices));
  if (inv !== null) return inv;
  const est = pickTotal(latest(docs.estimates));
  if (est !== null) return est;

  const q = parseFloat(job.quoteAmount);
  return isNaN(q) ? 0 : q;
};

// Public accessor. Returns 0 for any role other than Owner so that every
// job card, stat total, and Estimated Total block across the app hides
// dollar amounts from Managers and Workers without every template having
// to role-check individually.
window.getJobDisplayTotal = function(job) {
  try {
    const role = (window.CL_FIREBASE && CL_FIREBASE.role) || null;
    if (role && role !== 'owner') return 0;
  } catch (_) {}
  return window._rawJobDisplayTotal(job);
};

/**
 * Job economics. The single source of truth for how long a job takes and
 * what it costs us to run, shared by the estimate page's internal margin
 * panel and the job detail Est. Revenue panel so the two can't drift.
 *
 * Crew size only changes LABOR TIME. Fuel is unchanged by crew size: a
 * second worker runs a second machine, so the job finishes faster but
 * burns the same total gallons.
 */
window.CL_JOB_ECON = (function() {
  const SURFACE_PROFILES = {
    siding:     { label: 'Vinyl Siding (Flat Panels)', shCoverage: 4000, sqftPerHr: 1250 },
    vinylFence: { label: 'Vinyl Fence',                shCoverage: 3000, sqftPerHr:  650 },
    concrete:   { label: 'Concrete / Flatwork',        shCoverage: 4000, sqftPerHr:  600 },
    roof:       { label: 'Roof',                       shCoverage: 1250, sqftPerHr:  600 },
    fence:      { label: 'Wood Fence',                 shCoverage: 2500, sqftPerHr:  650 },
    other:      { label: 'Other / Mixed',              shCoverage: 3000, sqftPerHr: 1000 }
  };

  const FUEL_RATE_GAL_PER_HR = 0.675; // 13HP Loncin, moderate load
  const DEFAULT_LABOR_RATE   = 25;    // used when a worker has no pay rate on file
  const DEFAULT_FURNITURE_FEE = 50;
  const DEFAULT_DIRT_LEVEL   = 3.5;
  const DEFAULT_GAS_COST     = 3.50;
  const DEFAULT_CHEM_COST    = 4.00;

  // Read live so a change on the Settings page takes effect without a reload.
  function setting(key, fallback) {
    try {
      const s = JSON.parse(localStorage.getItem('cl-settings') || '{}');
      const n = parseFloat(s[key]);
      return isNaN(n) || n < 0 ? fallback : n;
    } catch (_) { return fallback; }
  }
  function laborRate()    { return setting('laborRate', DEFAULT_LABOR_RATE); }
  function furnitureFee() { return setting('furnitureFee', DEFAULT_FURNITURE_FEE); }

  function getSurfaceProfile(key) {
    return SURFACE_PROFILES[key] || SURFACE_PROFILES.other;
  }

  function getDirtMultiplier(dirtLevel, surfaceType) {
    const d = parseFloat(dirtLevel);
    const level = isNaN(d) ? DEFAULT_DIRT_LEVEL : d;
    let m;
    if      (level <= 1.0) m = 0.50;
    else if (level <= 2.0) m = 0.70;
    else if (level <= 3.0) m = 0.85;
    else if (level <= 3.5) m = 1.00;
    else if (level <= 4.0) m = 1.25;
    else                   m = 1.60;
    // Flatwork: cap speed-up on "easy" dirt (field ~8h/5000 sq ft at avg dirt)
    if (surfaceType === 'concrete') m = Math.max(m, 0.85);
    return m;
  }

  /** Hours for ONE worker to do this area. Crew size is applied separately. */
  function soloHours(squareFootage, surfaceType, dirtLevel) {
    const sqft = parseFloat(squareFootage) || 0;
    if (sqft <= 0) return 0;
    const profile = getSurfaceProfile(surfaceType);
    const effectiveSqftPerHr = profile.sqftPerHr / getDirtMultiplier(dirtLevel, surfaceType);
    return sqft / effectiveSqftPerHr;
  }

  /** Two people don't halve the clock. setup, hoses and moving cost time. */
  function crewSpeedFactor(crewSize, surfaceType) {
    if (crewSize >= 2) return surfaceType === 'concrete' ? 0.90 : 0.75;
    return 1;
  }

  /**
   * @param {object} opts
   *   services    [{ squareFootage, pricePerSqFt, surfaceType, dirtLevel? }]
   *   revenue     what the customer pays
   *   crew        [{ name, payRate, payType }] assigned workers (may be empty)
   *   gasCost     $/gal, chemicalCost $/gal
   * @returns breakdown with hours, fuel, chemical, labor, profit and per-worker pay
   */
  function estimate(opts) {
    const o = opts || {};
    const services = Array.isArray(o.services) ? o.services : [];
    const crew = Array.isArray(o.crew) ? o.crew : [];
    // A commission salesman doesn't speed the job up. only bodies on site do.
    const crewSize = Math.max(1, crew.filter(w => w.payType !== 'commission').length);
    const gasCost = parseFloat(o.gasCost) || DEFAULT_GAS_COST;
    const chemCost = parseFloat(o.chemicalCost) || DEFAULT_CHEM_COST;
    const revenue = parseFloat(o.revenue) || 0;

    let soloTotalHours = 0;
    let chemicalGallons = 0;
    const areaBySurface = {};
    services.forEach(s => {
      // A negative price per sq ft is an area deduction. no time or product for it.
      if (parseFloat(s.pricePerSqFt) < 0) return;
      const sqft = parseFloat(s.squareFootage) || 0;
      soloTotalHours += soloHours(sqft, s.surfaceType, s.dirtLevel);
      chemicalGallons += sqft / getSurfaceProfile(s.surfaceType).shCoverage;
      const key = s.surfaceType || 'other';
      areaBySurface[key] = (areaBySurface[key] || 0) + sqft;
    });
    // Crew speed-up depends on the surface, so go by whichever covers the most area.
    const dominantSurface = Object.keys(areaBySurface)
      .sort((a, b) => areaBySurface[b] - areaBySurface[a])[0] || 'other';

    // Fuel tracks the solo-hours figure. more machines, less time, same gallons.
    const fuelGallons = FUEL_RATE_GAL_PER_HR * soloTotalHours;
    const fuelCost = fuelGallons * gasCost;
    const chemicalCost = chemicalGallons * chemCost;

    const speed = crewSpeedFactor(crewSize, dominantSurface);
    const onSiteHours = soloTotalHours * speed;

    const fallbackRate = laborRate();
    const perWorker = crew.map(w => {
      const rate = parseFloat(w.payRate);
      const hasRate = !isNaN(rate) && rate > 0;
      // Commission is a cut of the job, not of the clock. salesmen get paid
      // the same whether the crew is fast or slow.
      if (w.payType === 'commission') {
        return {
          name: w.name || 'Worker',
          payType: 'commission',
          rate: hasRate ? rate : null,
          hours: 0,
          pay: hasRate ? revenue * (rate / 100) : null,
          basis: hasRate ? `${rate}% of ${revenue ? '$' + revenue.toFixed(2) : 'the job'}` : 'no % set',
          estimated: hasRate
        };
      }
      const hourly = (w.payType === 'hourly' || !w.payType) && hasRate;
      return {
        name: w.name || 'Worker',
        payType: w.payType || 'hourly',
        rate: hasRate ? rate : null,
        hours: onSiteHours,
        pay: hourly ? rate * onSiteHours : null,
        basis: hourly ? `$${rate.toFixed(2)}/hr` : 'no hourly rate',
        estimated: hourly
      };
    });

    // Anyone on the clock without a usable rate still costs us time. fall
    // back so the margin isn't flattering.
    const onTheClock = perWorker.filter(w => w.payType !== 'commission');
    const commissionCost = perWorker
      .filter(w => w.payType === 'commission')
      .reduce((sum, w) => sum + (w.pay || 0), 0);
    const laborCost = onTheClock.length
      ? onTheClock.reduce((sum, w) => sum + (w.pay != null ? w.pay : fallbackRate * onSiteHours), 0)
      : fallbackRate * onSiteHours;

    const totalCost = laborCost + commissionCost + fuelCost + chemicalCost;
    const profit = revenue - totalCost;
    return {
      crewSize,
      soloHours: soloTotalHours,
      onSiteHours,
      fuelGallons,
      fuelCost,
      chemicalGallons,
      chemicalCost,
      laborCost,
      commissionCost,
      totalCost,
      revenue,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      perWorker,
      crewAssigned: crew.length > 0,
      onTheClockCount: onTheClock.length,
      fallbackLaborRate: fallbackRate
    };
  }

  return {
    SURFACE_PROFILES,
    FUEL_RATE_GAL_PER_HR,
    DEFAULT_LABOR_RATE,
    DEFAULT_FURNITURE_FEE,
    DEFAULT_DIRT_LEVEL,
    laborRate,
    furnitureFee,
    getSurfaceProfile,
    getDirtMultiplier,
    soloHours,
    crewSpeedFactor,
    estimate
  };
})();

// Business config. Loaded from settings (set via Settings page)
// Falls back to empty strings if no settings saved yet.
window.CL_CONFIG = (function() {
  try {
    const s = JSON.parse(localStorage.getItem('cl-settings') || '{}');
    const phone = (s.businessPhone || '').replace(/\D/g, '');
    return {
      phone:        phone,
      phoneDisplay: s.businessPhone || '',
      email:        s.businessEmail || '',
      name:         s.businessName  || 'Clearline',
      address:      s.businessAddress || '',
      reviewUrl:    s.reviewUrl || ''
    };
  } catch (e) {
    return { phone: '', phoneDisplay: '', email: '', name: 'Clearline', address: '', reviewUrl: '' };
  }
})();

/**
 * Normalize US phone numbers to (XXX) XXX-XXXX when possible.
 * Accepts messy input like 8036031375, (803) 6031375, 1-803-603-1375.
 * Returns '' for empty input; otherwise best-effort formatted string.
 */
window.formatPhoneUS = function(raw) {
  if (raw == null || raw === undefined) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  let d = digits;
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  // Keep original trimmed if we can't confidently format.
  return String(raw).trim();
};

/** Digits-only phone for tel: links / matching. */
window.phoneDigits = function(raw) {
  if (raw == null || raw === undefined) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  return d;
};

/**
 * Street-only, length-capped address for compact card display.
 * Drops city/state/country after the first comma and truncates long
 * street lines, e.g. "123 Long Winding Road Ct, Columbia, SC 29201" -> "123 Long Winding Road Ct".
 */
window.shortJobAddress = function(addr) {
  if (!addr) return '';
  let s = String(addr).trim();
  if (s.includes(',')) s = s.split(',')[0].trim();
  s = s.replace(/\s+United States$/i, '').trim();
  if (s.length > 36) s = s.slice(0, 34).trim() + '…';
  return s;
};

/**
 * Soft page transition for in-app navigations.
 * External / tel / mailto links skip the exit animation.
 */
window.clNavigate = function(href, opts) {
  if (!href) return;
  const options = opts || {};
  const raw = String(href);
  const isHash = raw.charAt(0) === '#';
  const isExternal = /^(https?:|tel:|mailto:|sms:)/i.test(raw)
    || options.external
    || options.blank
    || /^\/\//.test(raw);
  if (isHash) {
    location.hash = raw;
    return;
  }
  if (isExternal) {
    if (options.blank || /^(https?:)/i.test(raw)) {
      window.open(raw, '_blank', 'noopener');
    } else {
      location.href = raw;
    }
    return;
  }
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || document.body.classList.contains('cl-page-exit')) {
    location.href = raw;
    return;
  }
  document.body.classList.add('cl-page-exit');
  setTimeout(() => { location.href = raw; }, 170);
};

/** Mark same-app HTML links for animated navigation (opt-in via data-cl-nav). */
document.addEventListener('click', function(e) {
  const a = e.target.closest && e.target.closest('a[data-cl-nav]');
  if (!a) return;
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === '_blank') return;
  const href = a.getAttribute('href');
  if (!href || href.charAt(0) === '#') return;
  e.preventDefault();
  window.clNavigate(href);
}, true);
