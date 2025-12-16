/**
 * API utility for making backend requests
 * Uses relative URLs so requests are proxied through Next.js
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://cms-backend.finovateglobal.com';

import { getCookie, setCookie, deleteCookie } from './cookies';

const AUTH_TOKEN_COOKIE_NAME = 'auth_token';

/**
 * Get auth token from cookies (with localStorage fallback for migration)
 * Exported for use in components
 */
export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  
  // Try cookie first
  const cookieToken = getCookie(AUTH_TOKEN_COOKIE_NAME);
  if (cookieToken) return cookieToken;
  
  // Fallback to localStorage for migration
  const localToken = localStorage.getItem('auth_token');
  if (localToken) {
    // Migrate to cookie
    setCookie(AUTH_TOKEN_COOKIE_NAME, localToken, 7);
    localStorage.removeItem('auth_token');
    return localToken;
  }
  
  return null;
};

/**
 * Set auth token in cookies (and remove from localStorage)
 */
export const setAuthToken = (token: string | null): void => {
  if (typeof window === 'undefined') return;
  
  if (token) {
    // Store in cookie (7 days expiration)
    setCookie(AUTH_TOKEN_COOKIE_NAME, token, 7);
    // Also keep in localStorage for backward compatibility during migration
    localStorage.setItem('auth_token', token);
  } else {
    // Remove from both
    deleteCookie(AUTH_TOKEN_COOKIE_NAME);
    localStorage.removeItem('auth_token');
  }
};

/**
 * Get default headers with authentication
 */
const getHeaders = (options?: RequestInit): Record<string, string> => {
  const token = getAuthToken();
  
  // Start with custom headers if provided
  const customHeaders = options?.headers || {};
  
  // Convert HeadersInit to Record<string, string>
  const headersObj: Record<string, string> = {};
  
  // Handle different header types
  if (customHeaders instanceof Headers) {
    customHeaders.forEach((value, key) => {
      headersObj[key] = value;
    });
  } else if (Array.isArray(customHeaders)) {
    customHeaders.forEach(([key, value]) => {
      headersObj[key] = value;
    });
  } else if (customHeaders) {
    Object.assign(headersObj, customHeaders);
  }
  
  // Set default Content-Type
  headersObj['Content-Type'] = 'application/json';
  
  // Always set Authorization header if token exists (overrides any existing Authorization)
  if (token) {
    headersObj['Authorization'] = `Bearer ${token}`;
  }
  
  return headersObj;
};

export const api = {
  /**
   * Make a fetch request to the backend API
   */
  fetch: async (endpoint: string, options?: RequestInit): Promise<Response> => {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const headers = getHeaders(options);
    
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized - redirect to login
    if (response.status === 401 && typeof window !== 'undefined') {
      // Don't redirect if already on login page
      if (!window.location.pathname.includes('/login')) {
        setAuthToken(null);
        window.location.href = '/login';
      }
    }

    return response;
  },

  /**
   * GET request
   */
  get: async (endpoint: string, options?: RequestInit): Promise<Response> => {
    return api.fetch(endpoint, { ...options, method: 'GET' });
  },

  /**
   * POST request
   */
  post: async (endpoint: string, data?: any, options?: RequestInit): Promise<Response> => {
    return api.fetch(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  /**
   * DELETE request
   */
  delete: async (endpoint: string, options?: RequestInit): Promise<Response> => {
    return api.fetch(endpoint, { ...options, method: 'DELETE' });
  },

  /**
   * Upload file (FormData) request
   */
  upload: async (endpoint: string, formData: FormData, options?: RequestInit): Promise<Response> => {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const token = getAuthToken();
    
    const headers: Record<string, string> = {};
    
    // Don't set Content-Type for FormData - browser will set it with boundary
    // But we need to add Authorization header
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(url, {
      ...options,
      method: 'POST',
      headers,
      body: formData,
    });

    // Handle 401 Unauthorized - redirect to login
    if (response.status === 401 && typeof window !== 'undefined') {
      if (!window.location.pathname.includes('/login')) {
        setAuthToken(null);
        window.location.href = '/login';
      }
    }

    return response;
  },

  /**
   * Public GET request (no authentication, no redirect on 401)
   * Use for shared/public endpoints
   */
  publicGet: async (endpoint: string, options?: RequestInit): Promise<Response> => {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> || {}),
      },
    });

    // Don't redirect on 401 for public endpoints
    return response;
  },
};

