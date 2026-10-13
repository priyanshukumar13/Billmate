/**
 * Centralized API configuration and helper for React components and modules.
 * Integrates with window.getBillmateApiBase() and Vite environment variables.
 */

export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && typeof window.getBillmateApiBase === 'function') {
    return window.getBillmateApiBase();
  }
  if (typeof window !== 'undefined' && window.BILLMATE_API_BASE_URL) {
    return window.BILLMATE_API_BASE_URL.replace(/\/+$/, '');
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)) {
    return (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL).replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
  }
  return 'https://billmate-backend.onrender.com';
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
