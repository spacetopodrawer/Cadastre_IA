// Export all map-related modules
export * from './MapTileManager';
export * from './OfflineMapRenderer';

// Export types
export type { Tile } from './MapTileManager';
export type { OfflineTileLayerOptions } from './OfflineMapRenderer';

// Export utilities
import { mapTileManager } from './MapTileManager';
import { OfflineTileLayer } from './OfflineMapRenderer';

export const mapUtils = {
  /**
   * Initialize the map system with custom configuration
   * @param config Configuration options
   */
  async init(config: {
    maxCacheSize?: number;
    offlineEnabled?: boolean;
  } = {}) {
    if (config.maxCacheSize) {
      // @ts-ignore - Allow setting private property for initialization
      mapTileManager.maxCacheSize = config.maxCacheSize;
    }
    
    await mapTileManager.initialize();
    
    if (config.offlineEnabled !== false) {
      // Register service worker for offline support
      this.registerServiceWorker().catch(console.error);
    }
    
    return {
      mapTileManager,
      OfflineTileLayer,
    };
  },
  
  /**
   * Register service worker for offline support
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/map-sw.js');
        console.log('ServiceWorker registration successful');
        return registration;
      } catch (error) {
        console.error('ServiceWorker registration failed:', error);
        throw error;
      }
    } else {
      console.warn('Service workers are not supported in this browser');
      return null;
    }
  },
  
  /**
   * Preload map tiles for offline use
   * @param bounds [south, west, north, east] bounds to preload
   * @param zoomLevels Array of zoom levels to preload
   * @param source Source identifier (e.g., 'osm', 'mapbox')
   */
  async preloadMapTiles(
    bounds: [number, number, number, number],
    zoomLevels: number[],
    source: string
  ) {
    return mapTileManager.preloadTiles(bounds, zoomLevels, source);
  },
  
  /**
   * Check if the application is currently offline
   */
  isOffline(): boolean {
    return !navigator.onLine;
  },
  
  /**
   * Add an event listener for online/offline status changes
   * @param callback Function to call when status changes
   */
  onConnectionStatusChange(callback: (isOnline: boolean) => void) {
    const updateOnlineStatus = () => {
      callback(navigator.onLine);
    };
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Return cleanup function
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  },
};

// Export the map tile manager instance
export { mapTileManager };

// Export the OfflineTileLayer class
export { OfflineTileLayer };

// Default export for easier imports
export default {
  mapTileManager,
  OfflineTileLayer,
  ...mapUtils,
};
