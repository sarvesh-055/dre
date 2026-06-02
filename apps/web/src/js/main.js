/**
 * ===================================
 * FASHION MARKETPLACE - MAIN ENTRY
 * Enterprise-Grade PWA Application
 * ===================================
 */

import { App } from './core/app.js';
import { Router } from './core/router.js';
import { Store } from './core/store.js';
import { API } from './services/api.js';
import { I18n } from './services/i18n.js';
import { Analytics } from './core/analytics.js';
import { initAnimations } from './utils/animations.js';
import { checkForUpdates } from './utils/pwa-utils.js';

// ===================================
// APPLICATION INITIALIZATION
// ===================================

class FashionMarketplace {
  constructor() {
    this.app = null;
    this.router = null;
    this.store = null;
    this.api = null;
    this.i18n = null;
    this.analytics = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      // Show loading state
      this.showLoadingState();

      // Initialize core services
      await this.initializeServices();

      // Initialize application
      await this.initializeApp();

      // Setup event listeners
      this.setupEventListeners();

      // Hide loading state
      this.hideLoadingState();

      // Mark as initialized
      this.isInitialized = true;

      // Announce to screen readers
      this.announceToScreenReader('Application loaded successfully');

      // Log initialization
      console.log('[FashionMarketplace] Application initialized successfully');

    } catch (error) {
      console.error('[FashionMarketplace] Initialization failed:', error);
      this.handleInitializationError(error);
    }
  }

  /**
   * Initialize core services
   */
  async initializeServices() {
    // Initialize API client
    this.api = new API({
      baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
      timeout: 30000,
      retries: 3
    });

    // Initialize i18n
    this.i18n = new I18n({
      defaultLocale: 'en',
      supportedLocales: ['en', 'hi', 'es', 'fr', 'de'],
      fallbackLocale: 'en'
    });
    await this.i18n.init();

    // Initialize store (state management)
    this.store = new Store({
      persistKeys: ['user', 'cart', 'wishlist', 'preferences'],
      debug: import.meta.env.DEV
    });

    // Initialize analytics
    this.analytics = new Analytics({
      trackingId: import.meta.env.VITE_ANALYTICS_ID,
      anonymizeIp: true,
      respectDNT: true
    });

    // Initialize router
    this.router = new Router({
      mode: 'history',
      basePath: '',
      routes: this.getRoutes()
    });

    // Initialize app instance
    this.app = new App({
      store: this.store,
      router: this.router,
      i18n: this.i18n
    });
  }

  /**
   * Initialize application components
   */
  async initializeApp() {
    // Restore user session if exists
    await this.restoreSession();

    // Sync cart with server if user is logged in
    if (this.store.getState('user')) {
      await this.syncCart();
    }

    // Initialize animations
    initAnimations();

    // Check for PWA updates
    checkForUpdates();

    // Render initial route
    await this.router.navigate(window.location.pathname + window.location.search);
  }

  /**
   * Setup global event listeners
   */
  setupEventListeners() {
    // Handle browser back/forward
    window.addEventListener('popstate', (event) => {
      this.router.handlePopState(event);
    });

    // Handle online/offline status
    window.addEventListener('online', () => this.handleOnlineStatus());
    window.addEventListener('offline', () => this.handleOfflineStatus());

    // Handle visibility change (tab switch)
    document.addEventListener('visibilitychange', () => {
      this.handleVisibilityChange();
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      this.handleKeyboardShortcuts(event);
    });

    // Handle before unload (prevent accidental navigation)
    window.addEventListener('beforeunload', (event) => {
      if (this.store.getState('cart.items')?.length > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    // Handle service worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.handleServiceWorkerUpdate();
      });
    }

    // Handle orientation change
    window.addEventListener('orientationchange', () => {
      this.handleOrientationChange();
    });

    // Handle resize with debounce
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.handleResize();
      }, 250);
    });
  }

  /**
   * Restore user session from persistent storage
   */
  async restoreSession() {
    const token = this.store.getPersistent('auth.token');
    
    if (token) {
      try {
        // Validate token and fetch user data
        const user = await this.api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        this.store.setState('user', user);
        this.store.setState('auth.isAuthenticated', true);
        
        // Track logged-in user in analytics
        this.analytics.identify(user.id, {
          email: user.email,
          name: user.fullName,
          role: user.role
        });
        
      } catch (error) {
        // Token invalid, clear auth state
        this.store.clearAuth();
      }
    }
  }

  /**
   * Sync cart with server
   */
  async syncCart() {
    try {
      const localCart = this.store.getState('cart.items') || [];
      
      if (localCart.length === 0) {
        // Fetch cart from server
        const serverCart = await this.api.get('/cart');
        this.store.setState('cart.items', serverCart.items);
      } else {
        // Merge local cart with server cart
        const serverCart = await this.api.get('/cart');
        const mergedItems = this.mergeCartItems(localCart, serverCart.items);
        
        if (mergedItems.length !== localCart.length) {
          this.store.setState('cart.items', mergedItems);
          await this.api.put('/cart', { items: mergedItems });
        }
      }
    } catch (error) {
      console.warn('[FashionMarketplace] Cart sync failed:', error);
    }
  }

  /**
   * Merge cart items from local and server
   */
  mergeCartItems(localItems, serverItems) {
    const merged = new Map();
    
    // Add server items first
    serverItems.forEach(item => {
      merged.set(item.sku, item);
    });
    
    // Merge local items (prefer local quantities if newer)
    localItems.forEach(item => {
      const existing = merged.get(item.sku);
      if (existing) {
        // Keep server item but update quantity if local is different
        if (item.quantity !== existing.quantity && item.updatedAt > existing.updatedAt) {
          merged.set(item.sku, { ...existing, quantity: item.quantity });
        }
      } else {
        merged.set(item.sku, item);
      }
    });
    
    return Array.from(merged.values());
  }

  /**
   * Show loading state
   */
  showLoadingState() {
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.classList.remove('hidden');
    }
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    const loader = document.getElementById('app-loader');
    if (loader) {
      setTimeout(() => {
        loader.classList.add('hidden');
      }, 300);
    }
  }

  /**
   * Handle initialization error
   */
  handleInitializationError(error) {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="error-container" style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
          text-align: center;
        ">
          <h1 style="font-size: 2rem; margin-bottom: 1rem; color: var(--color-error);">
            Something went wrong
          </h1>
          <p style="margin-bottom: 2rem; color: var(--color-text-secondary);">
            We're having trouble loading the application. Please try refreshing the page.
          </p>
          <button 
            onclick="window.location.reload()"
            style="
              padding: 0.75rem 2rem;
              background-color: var(--color-primary);
              color: white;
              border: none;
              border-radius: var(--radius-lg);
              font-weight: 600;
              cursor: pointer;
            "
          >
            Refresh Page
          </button>
        </div>
      `;
    }
    
    // Hide loader
    this.hideLoadingState();
    
    // Log error
    this.analytics?.track('application_error', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Announce message to screen readers
   */
  announceToScreenReader(message) {
    const announcer = document.getElementById('sr-announcements');
    if (announcer) {
      announcer.textContent = message;
      // Clear after announcement
      setTimeout(() => {
        announcer.textContent = '';
      }, 1000);
    }
  }

  /**
   * Handle online status change
   */
  handleOnlineStatus() {
    console.log('[FashionMarketplace] Back online');
    this.store.setState('app.isOnline', true);
    this.announceToScreenReader('You are back online');
    
    // Sync any pending actions
    this.syncPendingActions();
  }

  /**
   * Handle offline status change
   */
  handleOfflineStatus() {
    console.log('[FashionMarketplace] Went offline');
    this.store.setState('app.isOnline', false);
    this.announceToScreenReader('You are offline. Some features may be unavailable.');
    
    // Show offline notification
    this.showToast({
      type: 'warning',
      message: 'You are offline. Some features may be unavailable.',
      duration: 5000
    });
  }

  /**
   * Handle visibility change
   */
  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // Tab became visible - refresh data if needed
      this.refreshStaleData();
    } else {
      // Tab became hidden - pause animations, etc.
      this.pauseBackgroundTasks();
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboardShortcuts(event) {
    // Ctrl/Cmd + K: Search
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      this.openSearch();
    }
    
    // Ctrl/Cmd + C: Open Cart
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      event.preventDefault();
      this.router.navigate('/cart');
    }
    
    // Escape: Close modals
    if (event.key === 'Escape') {
      this.closeModals();
    }
  }

  /**
   * Handle service worker update
   */
  handleServiceWorkerUpdate() {
    this.showToast({
      type: 'info',
      message: 'A new version is available. Refresh to update.',
      duration: 10000,
      action: {
        label: 'Refresh',
        callback: () => window.location.reload()
      }
    });
  }

  /**
   * Handle orientation change
   */
  handleOrientationChange() {
    // Adjust layout for orientation
    this.app.recalculateLayout();
  }

  /**
   * Handle window resize
   */
  handleResize() {
    // Recalculate responsive components
    this.app.recalculateLayout();
  }

  /**
   * Sync pending actions when back online
   */
  async syncPendingActions() {
    const pendingActions = this.store.getState('app.pendingActions') || [];
    
    for (const action of pendingActions) {
      try {
        await this.api[action.method](action.endpoint, action.data);
        this.store.removePendingAction(action.id);
      } catch (error) {
        console.warn('[FashionMarketplace] Failed to sync action:', action.id, error);
      }
    }
  }

  /**
   * Refresh stale data
   */
  refreshStaleData() {
    // Check if data needs refresh based on timestamps
    const lastRefresh = this.store.getState('app.lastRefresh');
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    if (!lastRefresh || now - lastRefresh > staleThreshold) {
      this.app.refreshCriticalData();
      this.store.setState('app.lastRefresh', now);
    }
  }

  /**
   * Pause background tasks
   */
  pauseBackgroundTasks() {
    // Pause animations, auto-refresh, etc.
    this.app.pauseBackgroundTasks();
  }

  /**
   * Open search modal
   */
  openSearch() {
    this.app.openSearchModal();
  }

  /**
   * Close all modals
   */
  closeModals() {
    this.app.closeAllModals();
  }

  /**
   * Show toast notification
   */
  showToast(options) {
    this.app.showToast(options);
  }

  /**
   * Get application routes
   */
  getRoutes() {
    return [
      { path: '/', component: 'HomePage' },
      { path: '/collections/:category', component: 'CollectionPage' },
      { path: '/product/:slug', component: 'ProductDetailPage' },
      { path: '/cart', component: 'CartPage' },
      { path: '/checkout', component: 'CheckoutPage' },
      { path: '/account', component: 'AccountPage', protected: true },
      { path: '/account/orders', component: 'OrdersPage', protected: true },
      { path: '/account/wishlist', component: 'WishlistPage', protected: true },
      { path: '/search', component: 'SearchPage' },
      { path: '/offers', component: 'OffersPage' },
      { path: '/brands', component: 'BrandsPage' },
      { path: '/new-arrivals', component: 'NewArrivalsPage' },
      { path: '/best-sellers', component: 'BestSellersPage' },
      { path: '/vendor/:vendorId', component: 'VendorPage' },
      { path: '/404', component: 'NotFoundPage' },
      { path: '*', redirect: '/404' }
    ];
  }
}

// ===================================
// BOOTSTRAP APPLICATION
// ===================================

const fashionMarketplace = new FashionMarketplace();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    fashionMarketplace.init();
  });
} else {
  fashionMarketplace.init();
}

// Export for debugging and testing
if (import.meta.env.DEV) {
  window.__FASHION_MARKETPLACE__ = fashionMarketplace;
}

export default fashionMarketplace;
