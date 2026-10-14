/**
 * Centralized API configuration and helper for React components and modules.
 * Integrates with window.getBillmateApiBase() and Vite environment variables.
 */

const CANONICAL_PROD_URL = 'https://billmate-backend.onrender.com';
const CANONICAL_LOCAL_URL = 'http://localhost:5000';

function resolveCanonicalBaseUrl() {
  // 1. Explicit Vite environment variable (canonical build-time config)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').trim();
    if (envUrl) {
      return envUrl.replace(/\/+$/, '');
    }
  }

  // 2. Vite-injected global define or explicit window override
  if (typeof window !== 'undefined') {
    if (typeof window.__VITE_API_BASE_URL__ === 'string' && window.__VITE_API_BASE_URL__.trim() !== '') {
      return window.__VITE_API_BASE_URL__.trim().replace(/\/+$/, '');
    }
    if (typeof window.BILLMATE_API_BASE_URL === 'string' && window.BILLMATE_API_BASE_URL.trim() !== '') {
      return window.BILLMATE_API_BASE_URL.trim().replace(/\/+$/, '');
    }

    // 3. Localhost detection only in local development mode
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isDev = Boolean(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV);
    if (isLocalhost && isDev) {
      return CANONICAL_LOCAL_URL;
    }
  }

  // 4. Default to canonical production Render backend
  return CANONICAL_PROD_URL;
}

const CANONICAL_API_BASE = resolveCanonicalBaseUrl();

// Ensure window globals stay in sync across React and vanilla scripts
if (typeof window !== 'undefined') {
  window.BILLMATE_API_BASE_URL = CANONICAL_API_BASE;
  window.getBillmateApiBase = () => CANONICAL_API_BASE;
}

export function getApiBaseUrl() {
  return CANONICAL_API_BASE;
}

export function getAuthToken() {
  if (typeof window !== 'undefined' && typeof window.getBillmateToken === 'function') {
    return window.getBillmateToken();
  }
  try {
    const token = localStorage.getItem('billmateToken');
    if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
      return '';
    }
    return token.trim();
  } catch (_) {
    return '';
  }
}

export function getAuthHeaders(extra = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function extractErrorMessage(data, fallback = 'An unexpected error occurred.') {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  return data.error || data.message || data.msg || fallback;
}
