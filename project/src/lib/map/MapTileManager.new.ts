import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Buffer } from 'buffer';

// Types de sources de tuiles supportées
export type TileSourceType = 'mbtiles' | 'geotiff' | 'raster' | 'vector' | 'wms' | 'wmts' | 'tms';

// Formats de tuiles supportés
export type TileFormat = 'png' | 'jpeg' | 'webp' | 'pbf' | 'mvt' | 'geotiff' | 'mbtiles';

// Système de référence des coordonnées
export type CRS = 'EPSG:4326' | 'EPSG:3857' | 'EPSG:2154' | string;

// Interface pour les coordonnées d'une tuile
export interface TileCoords {
  z: number;
  x: number;
  y: number;
}

// Interface pour les limites géographiques
export type Bounds = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

// Interface pour une source de tuiles
export interface TileSource {
  id: string;
  name: string;
  type: TileSourceType;
  format: TileFormat;
  url: string;
  bounds: Bounds;
  zoomLevels: number[];
  crs: CRS;
  metadata?: Record<string, any>;
  isLocal?: boolean;
  lastSynced?: number;
  size?: number;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
}

// Interface pour une tuile individuelle
export interface Tile extends TileCoords {
  data: ArrayBuffer;
  format: TileFormat;
  source: string; // ID de la source
  crs: CRS;
  timestamp: number;
  metadata?: Record<string, any>;
  bounds?: Bounds; // Bornes géographiques de la tuile
  etag?: string; // Pour la validation de cache
  expires?: number; // Date d'expiration
}

// Schéma de la base de données IndexedDB
interface MapTileDB extends DBSchema {
  // Stockage des tuiles
  tiles: {
    key: [string, number, number, number]; // [sourceId, z, x, y]
    value: Tile;
    indexes: {
      'by-source': string;
      'by-timestamp': number;
      'by-bounds': [number, number, number, number];
    };
  };
  
  // Sources de tuiles enregistrées
  sources: {
    key: string; // ID de la source
    value: TileSource;
    indexes: {
      'by-name': string;
      'by-type': string;
      'by-bounds': [number, number, number, number];
    };
  };
  
  // Métadonnées globales
  metadata: {
    key: string;
    value: any;
  };
}

// Classe principale du gestionnaire de tuiles
class MapTileManager {
  private db: IDBPDatabase<MapTileDB> | null = null;
  private dbName = 'map-tile-cache';
  private dbVersion = 2; // Version incrémentée pour les changements de schéma
  private maxCacheSize = 500 * 1024 * 1024; // 500MB par défaut
  private currentCacheSize = 0;
  private sources: Map<string, TileSource> = new Map();
  private tileQueue: Map<string, Promise<Tile>> = new Map();
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // Initialisation de la base de données
  async initialize() {
    // Empêcher les initialisations multiples
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      try {
        this.db = await openDB<MapTileDB>(this.dbName, this.dbVersion, {
          upgrade: (db, oldVersion) => {
            // Gérer les mises à jour de version
            if (oldVersion < 1) {
              // Création initiale du schéma
              const tileStore = db.createObjectStore('tiles', {
                keyPath: ['source', 'z', 'x', 'y'],
              });
              
              tileStore.createIndex('by-source', 'source');
              tileStore.createIndex('by-timestamp', 'timestamp');
              
              const sourceStore = db.createObjectStore('sources', {
                keyPath: 'id'
              });
              
              sourceStore.createIndex('by-name', 'name', { unique: false });
              sourceStore.createIndex('by-type', 'type', { unique: false });
              
              db.createObjectStore('metadata');
            }
            
            // Mises à jour futures iraient ici
            if (oldVersion < 2) {
              // Ajouter les nouveaux index ou stores pour la version 2
              const tileStore = db.transaction('tiles').objectStore('tiles');
              
              // Ajouter l'index par bornes s'il n'existe pas
              if (!tileStore.indexNames.contains('by-bounds')) {
                tileStore.createIndex('by-bounds', 'bounds', { multiEntry: true });
              }
            }
          },
        });

        // Charger les sources en mémoire
        await this.loadSources();
        
        // Calculer la taille actuelle du cache
        await this.calculateCacheSize();
        
        this.isInitialized = true;
      } catch (error) {
        console.error('Échec de l\'initialisation de MapTileManager:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  // Charger toutes les sources depuis la base de données
  private async loadSources() {
    if (!this.db) return;
    
    const sources = await this.db.getAll('sources');
    this.sources = new Map(sources.map(s => [s.id, s]));
  }

  // Calculer la taille actuelle du cache
  private async calculateCacheSize() {
    if (!this.db) return 0;
    
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

  // Enregistrer une nouvelle source de tuiles
  async registerSource(source: Omit<TileSource, 'id' | 'lastSynced'>): Promise<TileSource> {
    if (!this.db) await this.initialize();
    
    const sourceWithId: TileSource = {
      ...source,
      id: crypto.randomUUID(),
      lastSynced: Date.now(),
      isLocal: source.isLocal ?? false,
    };
    
    await this.db!.put('sources', sourceWithId);
    this.sources.set(sourceWithId.id, sourceWithId);
    
    return sourceWithId;
  }

  // Récupérer une source par son ID
  getSource(sourceId: string): TileSource | undefined {
    return this.sources.get(sourceId);
  }

  // Mettre à jour une source existante
  async updateSource(sourceId: string, updates: Partial<TileSource>): Promise<boolean> {
    if (!this.db) await this.initialize();
    
    const source = this.sources.get(sourceId);
    if (!source) return false;
    
    const updatedSource: TileSource = {
      ...source,
      ...updates,
      id: sourceId, // S'assurer que l'ID ne change pas
    };
    
    await this.db!.put('sources', updatedSource);
    this.sources.set(sourceId, updatedSource);
    
    return true;
  }

  // Supprimer une source et ses tuiles associées
  async removeSource(sourceId: string): Promise<boolean> {
    if (!this.db) await this.initialize();
    
    const tx = this.db!.transaction(['sources', 'tiles'], 'readwrite');
    
    try {
      // Supprimer toutes les tuiles de cette source
      const tileStore = tx.objectStore('tiles');
      const index = tileStore.index('by-source');
      let cursor = await index.openCursor(IDBKeyRange.only(sourceId));
      
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      
      // Supprimer la source
      await tx.objectStore('sources').delete(sourceId);
      this.sources.delete(sourceId);
      
      await tx.done;
      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression de la source:', error);
      return false;
    }
  }

  // Lister toutes les sources
  listSources(filter?: { type?: TileSourceType; localOnly?: boolean }): TileSource[] {
    let sources = Array.from(this.sources.values());
    
    if (filter) {
      if (filter.type) {
        sources = sources.filter(s => s.type === filter.type);
      }
      if (filter.localOnly) {
        sources = sources.filter(s => s.isLocal);
      }
    }
    
    return sources;
  }

  // Trouver des sources couvrant une zone géographique
  async findSourcesForBounds(bounds: Bounds, zoom: number): Promise<TileSource[]> {
    if (!this.db) await this.initialize();
    
    return Array.from(this.sources.values()).filter(source => {
      // Vérifier si le niveau de zoom est pris en charge
      const zoomMatch = source.zoomLevels 
        ? source.zoomLevels.includes(zoom)
        : (source.minZoom === undefined || zoom >= source.minZoom) && 
          (source.maxZoom === undefined || zoom <= source.maxZoom);
      
      if (!zoomMatch) return false;
      
      // Vérifier le chevauchement des bornes
      const [minLon, minLat, maxLon, maxLat] = bounds;
      const [srcMinLon, srcMinLat, srcMaxLon, srcMaxLat] = source.bounds;
      
      return !(srcMinLon > maxLon || 
              srcMaxLon < minLon || 
              srcMinLat > maxLat || 
              srcMaxLat < minLat);
    });
  }

  // Enregistrer une tuile dans le cache
  async storeTile(tile: Omit<Tile, 'timestamp'>): Promise<void> {
    if (!this.db) await this.initialize();
    
    const tileWithTimestamp: Tile = {
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

  // Récupérer une tuile du cache
  async getTile(sourceId: string, z: number, x: number, y: number, crs: CRS = 'EPSG:3857'): Promise<Tile | undefined> {
    if (!this.db) await this.initialize();
    
    try {
      const tile = await this.db!.get('tiles', [sourceId, z, x, y]);
      
      if (tile) {
        // Vérifier si la tuile est expirée
        if (tile.expires && tile.expires < Date.now()) {
          await this.db!.delete('tiles', [sourceId, z, x, y]);
          this.currentCacheSize -= tile.data.byteLength;
          return undefined;
        }
        
        // Mettre à jour le timestamp d'accès
        tile.timestamp = Date.now();
        await this.db!.put('tiles', tile);
        
        return tile;
      }
      
      return undefined;
    } catch (error) {
      console.error('Erreur lors de la récupération de la tuile depuis le cache:', error);
      return undefined;
    }
  }

  // Télécharger une tuile depuis une source distante
  async fetchTile(sourceId: string, z: number, x: number, y: number): Promise<Tile | undefined> {
    if (!this.db) await this.initialize();
    
    const source = this.sources.get(sourceId);
    if (!source || source.isLocal) return undefined;
    
    const cacheKey = `${sourceId}:${z}:${x}:${y}`;
    
    // Vérifier si une requête est déjà en cours pour cette tuile
    if (this.tileQueue.has(cacheKey)) {
      return this.tileQueue.get(cacheKey);
    }
    
    const fetchPromise = (async (): Promise<Tile> => {
      try {
        // Construire l'URL de la tuile
        let url = source.url
          .replace('{z}', z.toString())
          .replace('{x}', x.toString())
          .replace('{y}', y.toString())
          .replace('{s}', ['a', 'b', 'c'][Math.floor(Math.random() * 3)]); // Pour le load balancing
        
        const response = await fetch(url, {
          headers: source.metadata?.headers || {}
        });
        
        if (!response.ok) {
          throw new Error(`Échec du téléchargement de la tuile: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.arrayBuffer();
        const etag = response.headers.get('ETag');
        const cacheControl = response.headers.get('Cache-Control');
        
        // Calculer la date d'expiration
        let expires: number | undefined;
        if (cacheControl) {
          const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
          if (maxAgeMatch) {
            expires = Date.now() + (parseInt(maxAgeMatch[1], 10) * 1000);
          }
        }
        
        const tile: Tile = {
          z, x, y,
          data,
          format: source.format,
          source: sourceId,
          crs: source.crs,
          timestamp: Date.now(),
          etag,
          expires,
          metadata: {
            ...source.metadata,
            url,
            fetched: new Date().toISOString(),
          },
        };
        
        // Stocker la tuile dans le cache
        await this.storeTile(tile);
        
        return tile;
      } catch (error) {
        console.error(`Erreur lors du téléchargement de la tuile ${sourceId} ${z}/${x}/${y}:`, error);
        throw error;
      } finally {
        this.tileQueue.delete(cacheKey);
      }
    })();
    
    this.tileQueue.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  // Obtenir une tuile, du cache ou de la source distante
  async getOrFetchTile(sourceId: string, z: number, x: number, y: number): Promise<Tile | undefined> {
    // Essayer d'abord le cache
    const cachedTile = await this.getTile(sourceId, z, x, y);
    if (cachedTile) return cachedTile;
    
    // Sinon, essayer de la récupérer depuis la source distante
    return this.fetchTile(sourceId, z, x, y);
  }

  // Précharger les tuiles pour une zone et des niveaux de zoom donnés
  async preloadTiles(
    bounds: Bounds,
    zoomLevels: number[],
    sourceId: string,
    onProgress?: (progress: { loaded: number; total: number }) => void
  ): Promise<void> {
    if (!this.db) await this.initialize();
    
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source ${sourceId} introuvable`);
    
    const [minLon, minLat, maxLon, maxLat] = bounds;
    const promises: Promise<void>[] = [];
    let loaded = 0;
    let total = 0;
    
    // Calculer le nombre total de tuiles à charger pour la progression
    for (const z of zoomLevels) {
      if ((source.minZoom !== undefined && z < source.minZoom) || 
          (source.maxZoom !== undefined && z > source.maxZoom)) {
        continue;
      }
      
      const [minTileX, minTileY] = this.lngLatToTile(minLon, maxLat, z);
      const [maxTileX, maxTileY] = this.lngLatToTile(maxLon, minLat, z);
      
      total += (maxTileX - minTileX + 1) * (maxTileY - minTileY + 1);
    }
    
    // Précharger les tuiles pour chaque niveau de zoom
    for (const z of zoomLevels) {
      if ((source.minZoom !== undefined && z < source.minZoom) || 
          (source.maxZoom !== undefined && z > source.maxZoom)) {
        continue;
      }
      
      const [minTileX, minTileY] = this.lngLatToTile(minLon, maxLat, z);
      const [maxTileX, maxTileY] = this.lngLatToTile(maxLon, minLat, z);
      
      for (let x = minTileX; x <= maxTileX; x++) {
        for (let y = minTileY; y <= maxTileY; y++) {
          // Vérifier d'abord si la tuile est déjà en cache
          const cacheKey = `${sourceId}:${z}:${x}:${y}`;
          if (this.tileQueue.has(cacheKey)) {
            // Si une requête est déjà en cours, on l'ajoute aux promesses
            const promise = this.tileQueue.get(cacheKey)!.then(() => {
              loaded++;
              onProgress?.({ loaded, total });
            });
            promises.push(promise);
            continue;
          }
          
          const promise = this.getOrFetchTile(sourceId, z, x, y)
            .then(() => {
              loaded++;
              onProgress?.({ loaded, total });
            })
            .catch(error => {
              console.error(`Erreur lors du préchargement de la tuile ${sourceId} ${z}/${x}/${y}:`, error);
              loaded++; // Compter quand même comme chargé pour la progression
              onProgress?.({ loaded, total });
            });
          
          promises.push(promise);
        }
      }
    }
    
    await Promise.all(promises);
  }

  // Convertir des coordonnées longitude/latitude en coordonnées de tuile
  private lngLatToTile(lng: number, lat: number, z: number): [number, number] {
    const x = Math.floor((lng + 180) / 360 * Math.pow(2, z));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
    return [x, y];
  }

  // Convertir des coordonnées de tuile en coordonnées longitude/latitude
  private tileToLngLat(x: number, y: number, z: number): [number, number] {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    const lng = (x / Math.pow(2, z) * 360 - 180);
    const lat = (180 / Math.PI * Math.atan(Math.sinh(n)));
    return [lng, lat];
  }

  // Nettoyer le cache en supprimant les tuiles les plus anciennes
  async cleanupCache(targetSize: number): Promise<number> {
    if (!this.db) await this.initialize();
    if (!this.db) return 0;
    
    const tx = this.db.transaction('tiles', 'readwrite');
    const store = tx.objectStore('tiles');
    const index = store.index('by-timestamp');
    
    let cursor = await index.openCursor(null, 'next');
    let deletedSize = 0;
    
    while (cursor && deletedSize < targetSize) {
      const currentKey = cursor.primaryKey as [string, number, number, number];
      await store.delete(currentKey);
      
      deletedSize += cursor.value.data.byteLength;
      cursor = await cursor.continue();
    }
    
    this.currentCacheSize = Math.max(0, this.currentCacheSize - deletedSize);
    return deletedSize;
  }

  // Vider complètement le cache
  async clearCache(): Promise<void> {
    if (!this.db) await this.initialize();
    if (!this.db) return;
    
    const tx = this.db.transaction('tiles', 'readwrite');
    await tx.objectStore('tiles').clear();
    this.currentCacheSize = 0;
  }

  // Obtenir des statistiques sur le cache
  async getCacheStats() {
    if (!this.db) await this.initialize();
    if (!this.db) return null;
    
    const count = await this.db.count('tiles');
    const size = this.currentCacheSize;
    
    // Compter le nombre de tuiles par source
    const sources = new Map<string, number>();
    const tx = this.db.transaction('tiles', 'readonly');
    const store = tx.objectStore('tiles');
    
    let cursor = await store.openCursor();
    while (cursor) {
      const sourceId = cursor.value.source;
      sources.set(sourceId, (sources.get(sourceId) || 0) + 1);
      cursor = await cursor.continue();
    }
    
    return {
      count,
      size,
      sizeFormatted: this.formatFileSize(size),
      maxSize: this.maxCacheSize,
      maxSizeFormatted: this.formatFileSize(this.maxCacheSize),
      usage: (size / this.maxCacheSize) * 100,
      sources: Object.fromEntries(sources.entries()),
      sourcesInfo: Array.from(sources.entries()).map(([sourceId, count]) => ({
        id: sourceId,
        name: this.sources.get(sourceId)?.name || sourceId,
        count,
        size: 0, // Serait calculé si nécessaire
      })),
    };
  }

  // Définir la taille maximale du cache
  setMaxCacheSize(sizeInBytes: number): void {
    this.maxCacheSize = sizeInBytes;
    
    // Si la taille actuelle dépasse la nouvelle limite, nettoyer le cache
    if (this.currentCacheSize > this.maxCacheSize) {
      this.cleanupCache(this.currentCacheSize - this.maxCacheSize).catch(console.error);
    }
  }

  // Formater la taille en octets en chaîne lisible
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Octets';
    
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Exporter une instance singleton
export const mapTileManager = new MapTileManager();

// Initialiser le gestionnaire de tuiles au chargement du module
mapTileManager.initialize().catch(console.error);

export type { TileSource, Bounds, TileCoords };
