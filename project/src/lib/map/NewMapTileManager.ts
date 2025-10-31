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
      'by-bounds': [number, number, number, number]; // Pour la recherche par zone
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
  private dbVersion = 1;
  private maxCacheSize = 500 * 1024 * 1024; // 500MB par défaut
  private currentCacheSize = 0;
  private sources: Map<string, TileSource> = new Map();
  private tileQueue: Map<string, Promise<Tile>> = new Map();

  // Initialisation de la base de données
  async initialize() {
    this.db = await openDB<MapTileDB>(this.dbName, this.dbVersion, {
      upgrade: (db) => {
        // Store pour les tuiles
        const tileStore = db.createObjectStore('tiles', {
          keyPath: ['source', 'z', 'x', 'y'],
        });
        
        tileStore.createIndex('by-source', 'source');
        tileStore.createIndex('by-timestamp', 'timestamp');
        
        // Store pour les sources
        const sourceStore = db.createObjectStore('sources', {
          keyPath: 'id'
        });
        
        sourceStore.createIndex('by-name', 'name', { unique: false });
        sourceStore.createIndex('by-type', 'type', { unique: false });
        
        // Store pour les métadonnées
        db.createObjectStore('metadata');
      },
    });

    // Charger les sources en mémoire
    await this.loadSources();
    
    // Calculer la taille actuelle du cache
    await this.calculateCacheSize();
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
    
    // Pour simplifier, nous allons vérifier les sources dont les bornes se chevauchent
    // avec la zone demandée et qui contiennent le niveau de zoom
    return Array.from(this.sources.values()).filter(source => {
      const zoomMatch = !source.zoomLevels || 
                       (zoom >= (source.minZoom || 0) && 
                        zoom <= (source.maxZoom || 24));
      
      if (!zoomMatch) return false;
      
      // Vérifier le chevauchement des bornes
      const [minLon, minLat, maxLon, maxLat] = bounds;
      const [srcMinLon, srcMinLat, srcMaxLon, srcMaxLat] = source.bounds;
      
      return !(minLon > srcMaxLon || 
              maxLon < srcMinLon || 
              minLat > srcMaxLat || 
              maxLat < srcMinLat);
    });
  }

  // Obtenir une tuile spécifique
  async getTile(sourceId: string, z: number, x: number, y: number): Promise<Tile | null> {
    if (!this.db) await this.initialize();
    
    const cacheKey = `${sourceId}/${z}/${x}/${y}`;
    
    // Vérifier si la tuile est déjà en cours de chargement
    if (this.tileQueue.has(cacheKey)) {
      return this.tileQueue.get(cacheKey) || null;
    }
    
    // Vérifier d'abord dans le cache
    try {
      const tile = await this.db!.get('tiles', [sourceId, z, x, y]);
      
      // Vérifier si la tuile a expiré
      if (tile && tile.expires && tile.expires < Date.now()) {
        // La tuile a expiré, la supprimer et la recharger
        await this.db!.delete('tiles', [sourceId, z, x, y]);
      } else if (tile) {
        // Mettre à jour le timestamp d'accès
        tile.timestamp = Date.now();
        await this.db!.put('tiles', tile);
        
        return tile;
      }
    } catch (error) {
      console.error('Error accessing tile cache:', error);
    }
    
    // Si on arrive ici, la tuile n'est pas en cache ou a expiré
    return this.loadAndCacheTile(sourceId, z, x, y);
  }

  // Charger et mettre en cache une tuile depuis sa source
  private async loadAndCacheTile(sourceId: string, z: number, x: number, y: number): Promise<Tile> {
    const cacheKey = `${sourceId}/${z}/${x}/${y}`;
    
    // Créer une promesse pour cette tuile
    const tilePromise = (async () => {
      const source = this.sources.get(sourceId);
      if (!source) {
        throw new Error(`Source not found: ${sourceId}`);
      }
      
      try {
        // Construire l'URL de la tuile en fonction du type de source
        let tileUrl = '';
        
        switch (source.type) {
          case 'tms':
            tileUrl = source.url
              .replace('{z}', z.toString())
              .replace('{x}', x.toString())
              .replace('{y}', y.toString())
              .replace('{-y}', ((1 << z) - y - 1).toString());
            break;
            
          case 'wms':
          case 'wmts':
            // Implémentation simplifiée - à adapter selon le fournisseur
            tileUrl = `${source.url}?SERVICE=${source.type.toUpperCase()}` +
              `&REQUEST=GetMap&VERSION=1.1.1` +
              `&LAYERS=${source.metadata?.layers || ''}` +
              `&STYLES=` +
              `&FORMAT=image/${source.format}` +
              `&TRANSPARENT=true` +
              `&WIDTH=256&HEIGHT=256` +
              `&SRS=EPSG:3857` +
              `&BBOX=${this.tileToBoundingBox(x, y, z).join(',')}`;
            break;
            
          default:
            throw new Error(`Unsupported source type: ${source.type}`);
        }
        
        // Télécharger la tuile
        const response = await fetch(tileUrl, {
          headers: source.metadata?.headers || {},
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load tile: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.arrayBuffer();
        
        // Créer l'objet tuile
        const tile: Tile = {
          z, x, y,
          source: sourceId,
          format: source.format,
          crs: source.crs,
          data,
          timestamp: Date.now(),
          etag: response.headers.get('ETag') || undefined,
          expires: this.parseCacheControl(response.headers.get('Cache-Control')),
        };
        
        // Mettre en cache la tuile
        await this.cacheTile(tile);
        
        return tile;
        
      } catch (error) {
        console.error(`Error loading tile ${cacheKey}:`, error);
        throw error;
      } finally {
        // Supprimer la promesse de la file d'attente
        this.tileQueue.delete(cacheKey);
      }
    })();
    
    // Ajouter la promesse à la file d'attente
    this.tileQueue.set(cacheKey, tilePromise);
    
    return tilePromise;
  }

  // Mettre en cache une tuile
  private async cacheTile(tile: Tile): Promise<void> {
    if (!this.db) await this.initialize();
    
    // Vérifier si nous devons libérer de l'espace
    const tileSize = tile.data.byteLength;
    if (this.currentCacheSize + tileSize > this.maxCacheSize) {
      await this.cleanupCache(tileSize);
    }
    
    // Ajouter la tuile au cache
    await this.db!.put('tiles', tile);
    this.currentCacheSize += tileSize;
  }

  // Nettoyer le cache pour libérer de l'espace
  private async cleanupCache(requiredSpace: number): Promise<void> {
    if (!this.db) return;
    
    const tx = this.db.transaction('tiles', 'readwrite');
    const store = tx.objectStore('tiles');
    const index = store.index('by-timestamp');
    
    let cursor = await index.openCursor(null, 'next');
    let freedSpace = 0;
    
    while (cursor && this.currentCacheSize + requiredSpace > this.maxCacheSize) {
      const tile = cursor.value;
      await cursor.delete();
      
      freedSpace += tile.data.byteLength;
      this.currentCacheSize -= tile.data.byteLength;
      
      cursor = await cursor.continue();
    }
    
    console.log(`Freed ${freedSpace} bytes from tile cache`);
  }

  // Convertir les coordonnées de tuile en limites géographiques (Web Mercator)
  private tileToBoundingBox(x: number, y: number, z: number): [number, number, number, number] {
    // Cette fonction convertit les coordonnées de tuile en coordonnées Web Mercator (EPSG:3857)
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    
    return [
      (x / Math.pow(2, z) * 360 - 180), // minLon
      (Math.atan(Math.sinh(n)) * 180) / Math.PI, // minLat
      ((x + 1) / Math.pow(2, z) * 360 - 180), // maxLon
      (Math.atan(Math.sinh(n - (2 * Math.PI) / Math.pow(2, z))) * 180) / Math.PI, // maxLat
    ];
  }

  // Parser l'en-tête Cache-Control pour obtenir la durée de validité
  private parseCacheControl(header: string | null): number | undefined {
    if (!header) return undefined;
    
    const maxAgeMatch = header.match(/max-age=(\d+)/);
    if (maxAgeMatch && maxAgeMatch[1]) {
      return Date.now() + parseInt(maxAgeMatch[1], 10) * 1000;
    }
    
    return undefined;
  }

  // Précharger une zone géographique
  async preloadArea(
    bounds: Bounds,
    zoomLevels: number[],
    sourceId: string
  ): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }
    
    console.log(`Preloading area for source: ${source.name}`);
    
    // Pour chaque niveau de zoom, calculer les tuiles à précharger
    for (const z of zoomLevels) {
      if (z < (source.minZoom || 0) || z > (source.maxZoom || 24)) {
        continue; // Ignorer les niveaux de zoom non supportés
      }
      
      const [minLon, minLat, maxLon, maxLat] = bounds;
      
      // Convertir les coordonnées géographiques en coordonnées de tuile
      const { tileX: minX, tileY: maxY } = this.lonLatToTile(minLon, maxLat, z);
      const { tileX: maxX, tileY: minY } = this.lonLatToTile(maxLon, minLat, z);
      
      console.log(`Preloading zoom ${z}: ${minX}-${maxX}, ${minY}-${maxY}`);
      
      // Précharger les tuiles dans cette plage
      const tilePromises = [];
      
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          // Vérifier d'abord si la tuile est déjà en cache
          const cacheKey = `${sourceId}/${z}/${x}/${y}`;
          if (!this.tileQueue.has(cacheKey)) {
            tilePromises.push(this.getTile(sourceId, z, x, y).catch(console.error));
          }
          
          // Limiter le nombre de requêtes parallèles
          if (tilePromises.length >= 16) {
            await Promise.all(tilePromises);
            tilePromises.length = 0;
          }
        }
      }
      
      // Attendre la fin du chargement des tuiles restantes
      if (tilePromises.length > 0) {
        await Promise.all(tilePromises);
      }
    }
    
    console.log('Preloading completed');
  }

  // Convertir des coordonnées géographiques en coordonnées de tuile
  private lonLatToTile(lon: number, lat: number, z: number): { tileX: number; tileY: number } {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, z));
    const y = Math.floor(
      (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)
    );
    
    return { tileX: x, tileY: y };
  }

  // Obtenir des statistiques sur le cache
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
      sources: this.sources.size,
    };
  }

  // Formater la taille en octets en chaîne lisible
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Vider le cache
  async clearCache(): Promise<void> {
    if (!this.db) return;
    
    await this.db.clear('tiles');
    this.currentCacheSize = 0;
  }
}

// Exporter une instance singleton
export const mapTileManager = new MapTileManager();

// Initialiser le gestionnaire de tuiles au chargement du module
mapTileManager.initialize().catch(console.error);

export default mapTileManager;
