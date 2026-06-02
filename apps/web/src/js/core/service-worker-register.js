/**
 * ===================================
 * SERVICE WORKER REGISTRATION
 * Handles SW lifecycle management
 * =================================== */

/**
 * Register the service worker
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      type: 'module',
      updateViaCache: 'none'
    });

    console.log('[SW] Registered:', registration.scope);

    // Handle updates
    handleUpdates(registration);

    // Handle controller changes
    handleControllerChange(registration);

    // Request notification permission if needed
    requestNotificationPermission();

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}

/**
 * Handle service worker updates
 */
function handleUpdates(registration) {
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    
    if (!newWorker) return;

    newWorker.addEventListener('statechange', () => {
      switch (newWorker.state) {
        case 'installed':
          if (navigator.serviceWorker.controller) {
            // New content available
            console.log('[SW] New content available, refresh to update');
            
            // Dispatch custom event
            window.dispatchEvent(new CustomEvent('sw:update', {
              detail: { registration, worker: newWorker }
            }));
          } else {
            // Content cached for offline use
            console.log('[SW] Content cached for offline use');
            
            window.dispatchEvent(new CustomEvent('sw:ready', {
              detail: { registration }
            }));
          }
          break;

        case 'redundant':
          console.log('[SW] Installing new service worker...');
          break;
      }
    });
  });
}

/**
 * Handle controller change
 */
function handleControllerChange(registration) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[SW] Controller changed - page reloaded');
    
    window.dispatchEvent(new CustomEvent('sw:controllerchange', {
      detail: { registration }
    }));
  });
}

/**
 * Request notification permission
 */
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    // Don't request immediately - wait for user interaction
    document.addEventListener('click', requestPermissionOnce, { once: true });
  }
}

let permissionRequested = false;

async function requestPermissionOnce() {
  if (permissionRequested) return;
  permissionRequested = true;

  if ('Notification' in window && Notification.permission === 'default') {
    try {
      const permission = await Notification.requestPermission();
      console.log('[SW] Notification permission:', permission);
      
      if (permission === 'granted') {
        // Subscribe to push notifications
        await subscribeToPush();
      }
    } catch (error) {
      console.error('[SW] Permission request failed:', error);
    }
  }
}

/**
 * Subscribe to push notifications
 */
async function subscribeToPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      // Generate VAPID key (should come from server in production)
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || 
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
      
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });
      
      // Send subscription to server
      await sendSubscriptionToServer(subscription);
    }
    
    console.log('[SW] Push subscription:', subscription.endpoint);
    return subscription;
  } catch (error) {
    console.error('[SW] Push subscription failed:', error);
    return null;
  }
}

/**
 * Send subscription to server
 */
async function sendSubscriptionToServer(subscription) {
  try {
    const response = await fetch('/api/v1/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscription)
    });
    
    if (!response.ok) {
      throw new Error('Failed to save subscription');
    }
    
    console.log('[SW] Subscription saved to server');
  } catch (error) {
    console.error('[SW] Failed to save subscription:', error);
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      
      // Remove from server
      await fetch('/api/v1/notifications/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
      
      console.log('[SW] Unsubscribed from push');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[SW] Unsubscribe failed:', error);
    return false;
  }
}

/**
 * Send message to service worker
 */
export async function sendMessageToSW(message) {
  if (!navigator.serviceWorker.controller) {
    console.warn('[SW] No active service worker');
    return null;
  }

  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    
    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };
    
    channel.port1.onerror = reject;
    
    navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
  });
}

/**
 * Check for service worker updates
 */
export async function checkForUpdates() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const update = await registration.update();
    
    if (update) {
      console.log('[SW] Update check completed');
    }
    
    return update;
  } catch (error) {
    console.error('[SW] Update check failed:', error);
    return false;
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches() {
  return sendMessageToSW({ type: 'CLEAR_CACHE' });
}

/**
 * Get cache status
 */
export async function getCacheStatus() {
  return sendMessageToSW({ type: 'GET_CACHE_STATUS' });
}

/**
 * Convert URL-safe base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

/**
 * Initialize service worker on load
 */
if (typeof window !== 'undefined') {
  registerServiceWorker();
}

// Export for manual control
export { registerServiceWorker };
