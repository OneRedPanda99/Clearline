// ─── Clearline — Shared Utilities ───────────────────────────────────
'use strict';

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
  // Remove any existing toast
  const existing = document.getElementById('sp-toast');
  if (existing) existing.remove();

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const colors = {
    success: '#10B981',
    error:   '#EF4444',
    info:    '#3B82F6'
  };

  const toast = document.createElement('div');
  toast.id = 'sp-toast';
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<span style="font-weight:700">${icons[type]}</span> ${message}`;
  
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '80px',          // above tab bar
    left:         '50%',
    transform:    'translateX(-50%) translateY(20px)',
    background:   colors[type],
    color:        '#fff',
    padding:      '10px 20px',
    borderRadius: '999px',
    fontSize:     '14px',
    fontWeight:   '500',
    boxShadow:    '0 4px 20px rgba(0,0,0,0.25)',
    zIndex:       '9999',
    opacity:      '0',
    transition:   'opacity 0.25s ease, transform 0.25s ease',
    whiteSpace:   'nowrap',
    maxWidth:     '90vw',
    textAlign:    'center'
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

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
      address:      s.businessAddress || ''
    };
  } catch (e) {
    return { phone: '', phoneDisplay: '', email: '', name: 'Clearline', address: '' };
  }
})();
