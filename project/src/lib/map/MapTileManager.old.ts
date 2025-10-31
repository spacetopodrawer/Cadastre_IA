import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Buffer } from 'buffer';

interface Tile {
  z: number;
  x: number;
  y: number;
  data: ArrayBuffer;
  format: 'png' | 'jpeg' | 'pbf' | 'mvt';
  source: 'osm' | 'mapbox' | 'drone' | 'generated';
  timestamp: number;
  metadata?: Record<string, any>;
}

interface MapTileDB extends DBSchema {
  tiles: {
    key: [number, number, number, string]; // [z, x, y, source]
    value: Tile;
    indexes: {
      'by-source': string;
      'by-timestamp': number;
    };
  };
  metadata: {
    key: string;
    value: any;
  };
}

class MapTileManager {
  private db: IDBPDatabase<MapTileDB> | null = null;
  private dbName = 'map-tile-cache';
  private dbVersion = 1;
  private maxCacheSize = 100 * 1024 * 1024; // 100MB
  private currentCacheSize = 0;

  async initialize() {
    this.db = await openDB<MapTileDB>(this.dbName, this.dbVersion, {
      upgrade(db) {
        // Créer le store pour les tuiles
        const tileStore = db.createObjectStore('tiles', {
          keyPath: ['z', 'x', 'y', 'source'],
        });
        
        // Créer des index pour les requêtes
        tileStore.createIndex('by-source', 'source');
        tileStore.createIndex('by-timestamp', 'timestamp');
        
        // Créer le store pour les métadonnées
        db.createObjectStore('metadata');
      },
    });

    // Calculer la taille actuelle du cache
    await this.calculateCacheSize();
  }

  private async calculateCacheSize() {
    if (!this.db) return;
    
    let totalSize = 0;
    const tx = this.db.transaction('tiles', 'readonly');
    const store = tx.objectStore('tiles');
    
    let cursor = await store.openCursor();
    while (cursor) {
      totalSize += cursor.value.data.byteLength;
      cursor = await cursor.continue();
    }
    
    this.currentCacheSize = totalSize;
    return totalSize;
  }

  async storeTile(tile: Omit<Tile, 'timestamp'>) {
    if (!this.db) await this.initialize();
    
    const tileWithTimestamp = {
      ...tile,
      timestamp: Date.now(),
    };
    
    // Vérifier la taille du cache
    const tileSize = tile.data.byteLength;
    if (this.currentCacheSize + tileSize > this.maxCacheSize) {
      await this.cleanupCache(this.currentCacheSize + tileSize - this.maxCacheSize);
    }
    
    await this.db!.put('tiles', tileWithTimestamp);
    this.currentCacheSize += tileSize;
  }

  async getTile(z: number, x: number, y: number, source: string): Promise<Tile | undefined> {
    if (!this.db) await this.initialize();
    
    try {
      const tile = await this.db!.get('tiles', [z, x, y, source]);
      if (tile) {
        // Mettre à jour le timestamp d'accès
        tile.timestamp = Date.now();
        await this.db!.put('tiles', tile);
      }
      return tile;
    } catch (error) {
      console.error('Error getting tile from cache:', error);
      return undefined;
    }
  }

  async preloadTiles(bounds: [number, number, number, number], zoomLevels: number[], source: string) {
    // Implémentation simplifiée du préchargement
    // Dans une implémentation réelle, cela utiliserait une bibliothèque comme leaflet.offline
    console.log(`Preloading tiles for bounds: ${bounds} at zoom levels: ${zoomLevels.join(', ')}`);
    
    // Implémentation de base - à étendre selon les besoins
    for (const z of zoomLevels) {
      // Calculer les coordonnées des tuiles pour les limites données
      // C'est une simplification - une implémentation réelle serait plus complexe
      const [minLat, minLng, maxLat, maxLng] = bounds;
      
      // Convertir les coordonnées en tuiles
      // Note: Cette conversion est simplifiée
      const minTileX = Math.floor((minLng + 180) / 360 * Math.pow(2, z));
      const maxTileX = Math.ceil((maxLng + 180) / 360 * Math.pow(2, z));
      const minTileY = Math.floor((1 - Math.log(Math.tan(maxLat * Math.PI / 180) + 1 / Math.cos(maxLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
      const maxTileY = Math.ceil((1 - Math.log(Math.tan(minLat * Math.PI / 180) + 1 / Math.cos(minLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
      
      // Précharger les tuiles
      for (let x = minTileX; x <= maxTileX; x++) {
        for (let y = minTileY; y <= maxTileY; y++) {
          // Dans une implémentation réelle, on téléchargerait la tuile ici
          // et on l'enregistrerait avec storeTile
          console.log(`Preloading tile z:${z}, x:${x}, y:${y} from ${source}`);
        }
      }
    }
  }

  async cleanupCache(targetSize: number) {
    if (!this.db) return;
    
    const tx = this.db.transaction('tiles', 'readwrite');
    const store = tx.objectStore('tiles');
    const index = store.index('by-timestamp');
    
    let cursor = await index.openCursor(null, 'next');
    let deletedSize = 0;
    
    while (cursor && deletedSize < targetSize) {
      const deleteTx = this.db.transaction('tiles', 'readwrite');
      await deleteTx.objectStore('tiles').delete(cursor.primaryKey);
      deletedSize += cursor.value.data.byteLength;
      cursor = await cursor.continue();
    }
    
    this.currentCacheSize = Math.max(0, this.currentCacheSize - deletedSize);
  }

  async clearCache() {
    if (!this.db) return;
    
    const tx = this.db.transaction('tiles', 'readwrite');
    await tx.objectStore('tiles').clear();
    this.currentCacheSize = 0;
  }

  async getCacheStats() {
    if (!this.db) await this.initialize();
    
    const count = await this.db!.count('tiles');
    const size = this.currentCacheSize;
    
    return {
      count,
      size,
      sizeFormatted: this.formatFileSize(size),
      maxSize: this.maxCacheSize,
      maxSizeFormatted: this.formatFileSize(this.maxCacheSize),
      usage: (size / this.maxCacheSize) * 100,
    };
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const mapTileManager = new MapTileManager();

export type { Tile };

// Initialiser le gestionnaire de tuiles au chargement du module
mapTileManager.initialize().catch(console.error);
