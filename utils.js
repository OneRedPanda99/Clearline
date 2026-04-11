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
