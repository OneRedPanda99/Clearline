// ─── Clearline — Shared Utilities ───────────────────────────────────
'use strict';

/** Unified Tailwind tokens — load utils.js before cdn.tailwindcss.com */
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
    showToast('Storage error — data may not be saved.', 'error');
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
 * reflects cloud sync state, so the user always knows their data is safe —
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
 * Active nav tab highlighter — call on every page.
 * Looks for <a> tags in .tab-bar and marks the one matching current URL.
 */
window.setActiveNav = function() {
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
 * field on the job itself is no longer the source of truth — instead we
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

// Business config — loaded from settings (set via Settings page)
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
