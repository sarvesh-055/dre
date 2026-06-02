/**
 * ===================================
 * API CLIENT
 * Enterprise-Grade HTTP Client with
 * Retry Logic, Caching & Error Handling
 * =================================== */

import { EventEmitter } from '../utils/event-emitter.js';

export class API extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.baseURL = options.baseURL || 'http://localhost:3000/api/v1';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.authToken = null;
    this.refreshToken = null;
    this.isRefreshing = false;
    this.refreshSubscribers = [];
    
    // Request queue for offline support
    this.requestQueue = [];
    this.isOnline = navigator.onLine;
    
    // Initialize event listeners
    this.initEventListeners();
  }
  
  /**
   * Initialize event listeners
   */
  initEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.emit('online');
      this.processRequestQueue();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.emit('offline');
    });
  }
  
  /**
   * Set authentication token
   */
  setAuth(token, refreshToken = null) {
    this.authToken = token;
    this.refreshToken = refreshToken;
  }
  
  /**
   * Clear authentication
   */
  clearAuth() {
    this.authToken = null;
    this.refreshToken = null;
  }
  
  /**
   * Build request URL
   */
  buildURL(endpoint, params = {}) {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`);
    
    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });
    
    return url.toString();
  }
  
  /**
   * Build request headers
   */
  buildHeaders(customHeaders = {}, includeAuth = true) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...customHeaders
    };
    
    // Add auth token if available and requested
    if (includeAuth && this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    
    // Add device fingerprint
    headers['X-Device-ID'] = this.getDeviceFingerprint();
    
    // Add request ID for tracing
    headers['X-Request-ID'] = this.generateRequestId();
    
    return headers;
  }
  
  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get device fingerprint
   */
  getDeviceFingerprint() {
    const stored = localStorage.getItem('device_fingerprint');
    if (stored) return stored;
    
    const fingerprint = this.generateDeviceFingerprint();
    localStorage.setItem('device_fingerprint', fingerprint);
    return fingerprint;
  }
  
  /**
   * Generate device fingerprint
   */
  generateDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    
    const data = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|');
    
    return btoa(data).substring(0, 32);
  }
  
  /**
   * Main request method
   */
  async request(method, endpoint, options = {}) {
    const {
      params = {},
      data = null,
      headers = {},
      useCache = method === 'GET',
      cacheKey = null,
      retryCount = 0,
      skipAuth = false
    } = options;
    
    const url = this.buildURL(endpoint, params);
    const cacheIdentifier = cacheKey || `${method}:${url}`;
    
    // Check cache for GET requests
    if (useCache && this.cache.has(cacheIdentifier)) {
      const cached = this.cache.get(cacheIdentifier);
      if (!this.isCacheExpired(cached)) {
        this.emit('cache-hit', { endpoint, method });
        return cached.data;
      }
      this.cache.delete(cacheIdentifier);
    }
    
    // Deduplicate pending requests
    if (this.pendingRequests.has(cacheIdentifier)) {
      this.emit('deduplicated', { endpoint, method });
      return this.pendingRequests.get(cacheIdentifier);
    }
    
    // Create request promise
    const requestPromise = (async () => {
      try {
        const response = await this.executeRequest(method, url, data, headers, skipAuth);
        
        // Cache successful GET responses
        if (useCache && method === 'GET' && response.ok) {
          this.cache.set(cacheIdentifier, {
            data: await this.parseResponse(response),
            timestamp: Date.now()
          });
        }
        
        // Emit success event
        this.emit('success', { endpoint, method, status: response.status });
        
        return this.parseResponse(response);
      } catch (error) {
        // Handle token expiration
        if (error.status === 401 && !skipAuth) {
          try {
            await this.refreshAuthToken();
            // Retry with new token
            return this.request(method, endpoint, { ...options, skipAuth: true });
          } catch (refreshError) {
            this.clearAuth();
            this.emit('auth-error', refreshError);
            throw refreshError;
          }
        }
        
        // Retry logic for network errors or 5xx
        if (retryCount < this.retries && (error.isNetworkError || error.status >= 500)) {
          const delay = this.retryDelay * Math.pow(2, retryCount);
          await this.sleep(delay);
          
          this.emit('retry', { endpoint, method, retryCount, delay });
          return this.request(method, endpoint, { ...options, retryCount: retryCount + 1 });
        }
        
        // Emit error event
        this.emit('error', { endpoint, method, error });
        
        throw error;
      } finally {
        this.pendingRequests.delete(cacheIdentifier);
      }
    })();
    
    // Store pending request
    this.pendingRequests.set(cacheIdentifier, requestPromise);
    
    return requestPromise;
  }
  
  /**
   * Execute HTTP request
   */
  async executeRequest(method, url, data, customHeaders, skipAuth) {
    const headers = this.buildHeaders(customHeaders, !skipAuth);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : null,
        signal: controller.signal,
        credentials: 'include',
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        throw new APIError('Too many requests', 429, { retryAfter });
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new APIError('Request timeout', 408);
      }
      
      if (error instanceof TypeError) {
        throw new APIError('Network error', 0, { isNetworkError: true });
      }
      
      throw error;
    }
  }
  
  /**
   * Parse response
   */
  async parseResponse(response) {
    const contentType = response.headers.get('content-type');
    
    // Handle no content
    if (response.status === 204) {
      return null;
    }
    
    // Parse JSON
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      
      // Check for API errors in response body
      if (!response.ok && data.error) {
        throw new APIError(
          data.error.message || 'API Error',
          response.status,
          data.error.details
        );
      }
      
      return data;
    }
    
    // Return text for other content types
    return response.text();
  }
  
  /**
   * Check if cache is expired
   */
  isCacheExpired(cached, maxAge = 5 * 60 * 1000) {
    return Date.now() - cached.timestamp > maxAge;
  }
  
  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Refresh auth token
   */
  async refreshAuthToken() {
    if (this.isRefreshing) {
      // Wait for current refresh to complete
      return new Promise((resolve, reject) => {
        this.refreshSubscribers.push({ resolve, reject });
      });
    }
    
    this.isRefreshing = true;
    
    try {
      if (!this.refreshToken) {
        throw new Error('No refresh token');
      }
      
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });
      
      if (!response.ok) {
        throw new Error('Token refresh failed');
      }
      
      const { token, refreshToken } = await response.json();
      
      this.setAuth(token, refreshToken);
      
      // Notify all waiting requests
      this.refreshSubscribers.forEach(callback => callback.resolve());
      this.refreshSubscribers = [];
      
      return token;
    } catch (error) {
      this.refreshSubscribers.forEach(callback => callback.reject(error));
      this.refreshSubscribers = [];
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }
  
  /**
   * Queue request for later (offline support)
   */
  queueRequest(method, endpoint, data) {
    this.requestQueue.push({
      id: this.generateRequestId(),
      method,
      endpoint,
      data,
      timestamp: Date.now(),
      attempts: 0
    });
    
    this.emit('queued', { method, endpoint });
  }
  
  /**
   * Process queued requests
   */
  async processRequestQueue() {
    if (!this.isOnline || this.requestQueue.length === 0) return;
    
    const queue = [...this.requestQueue];
    this.requestQueue = [];
    
    for (const request of queue) {
      try {
        await this.request(request.method, request.endpoint, { data: request.data });
        this.emit('processed', { id: request.id });
      } catch (error) {
        // Re-queue failed requests
        if (request.attempts < 3) {
          request.attempts++;
          this.requestQueue.push(request);
        } else {
          this.emit('failed', { id: request.id, error });
        }
      }
    }
  }
  
  /**
   * HTTP method shortcuts
   */
  get(endpoint, options = {}) {
    return this.request('GET', endpoint, options);
  }
  
  post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, { data, ...options });
  }
  
  put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, { data, ...options });
  }
  
  patch(endpoint, data, options = {}) {
    return this.request('PATCH', endpoint, { data, ...options });
  }
  
  delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, options);
  }
  
  upload(endpoint, file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.open('POST', this.buildURL(endpoint));
      xhr.setRequestHeader('Authorization', `Bearer ${this.authToken}`);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percentComplete = (event.loaded / event.total) * 100;
          onProgress(percentComplete);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.response));
        } else {
          reject(new APIError('Upload failed', xhr.status));
        }
      };
      
      xhr.onerror = () => {
        reject(new APIError('Upload failed', 0, { isNetworkError: true }));
      };
      
      xhr.send(formData);
    });
  }
  
  /**
   * Clear cache
   */
  clearCache(pattern) {
    if (pattern) {
      const regex = new RegExp(pattern);
      this.cache.forEach((_, key) => {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      });
    } else {
      this.cache.clear();
    }
    
    this.emit('cache-cleared');
  }
  
  /**
   * Cancel pending requests
   */
  cancelPendingRequests(pattern) {
    this.pendingRequests.forEach((promise, key) => {
      if (!pattern || pattern.test(key)) {
        // Note: Can't actually abort, but we can remove from pending
        this.pendingRequests.delete(key);
      }
    });
  }
}

/**
 * API Error class
 */
export class APIError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

// Export singleton instance
export const api = new API();
