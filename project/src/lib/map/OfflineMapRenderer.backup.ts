import { Map, TileLayer, TileLayerOptions, Util } from 'leaflet';
import { mapTileManager, Tile } from './MapTileManager';

export interface OfflineTileLayerOptions extends TileLayerOptions {
  source?: string;
  maxZoom?: number;
  minZoom?: number;
  errorTileUrl?: string;
  detectRetina?: boolean;
  crossOrigin?: boolean | string;
  updateWhenIdle?: boolean;
  updateInterval?: number;
  maxNativeZoom?: number;
  tileSize?: number;
  zoomOffset?: number;
  zoomReverse?: boolean;
  opacity?: number;
  zIndex?: number;
  bounds?: [number, number, number, number];
  noWrap?: boolean;
  pane?: string;
  className?: string;
  keepBuffer?: number;
  updateWhenZooming?: boolean;
  detectRetina?: boolean;
  reuseTiles?: boolean;
  updateWhenIdle?: boolean;
  updateInterval?: number;
  maxNativeZoom?: number;
  minNativeZoom?: number;
  zoomOffset?: number;
  tms?: boolean;
  zoomReverse?: boolean;
  opacity?: number;
  zIndex?: number;
  bounds?: [number, number, number, number];
  noWrap?: boolean;
  pane?: string;
  className?: string;
  keepBuffer?: number;
  updateWhenZooming?: boolean;
  detectRetina?: boolean;
  reuseTiles?: boolean;
  updateWhenIdle?: boolean;
  updateInterval?: number;
  maxNativeZoom?: number;
  minNativeZoom?: number;
  zoomOffset?: number;
  tms?: boolean;
  zoomReverse?: boolean;
  opacity?: number;
  zIndex?: number;
  bounds?: [number, number, number, number];
  noWrap?: boolean;
  pane?: string;
  className?: string;
  keepBuffer?: number;
  updateWhenZooming?: boolean;
  detectRetina?: boolean;
  reuseTiles?: boolean;
  updateWhenIdle?: boolean;
  updateInterval?: number;
  maxNativeZoom?: number;
  minNativeZoom?: number;
  zoomOffset?: number;
  tms?: boolean;
  zoomReverse?: boolean;
  opacity?: number;
  zIndex?: number;
  bounds?: [number, number, number, number];
  noWrap?: boolean;
  pane?: string;
  className?: string;
  keepBuffer?: number;
  updateWhenZooming?: boolean;
  detectRetina?: boolean;
  reuseTiles?: boolean;
}

export class OfflineTileLayer extends TileLayer {
  private _source: string;
  private _tileCache: Map<string, HTMLImageElement | string> = new Map();
  private _tileQueue: Set<string> = new Set();
  private _loadingTiles: Record<string, boolean> = {};
  private _tileSize: number;
  
  constructor(source: string, options: OfflineTileLayerOptions = {}) {
    super('', options);
    this._source = source;
    this._tileSize = options.tileSize || 256;
    
    // Initialiser le gestionnaire de tuiles
    mapTileManager.initialize().catch(console.error);
  }
  
  createTile(coords: { x: number; y: number; z: number }, done: () => void): HTMLElement {
    const tile = document.createElement('div');
    tile.className = 'leaflet-tile';
    
    const tileUrl = this.getTileUrl(coords);
    const tileKey = `${coords.z}/${coords.x}/${coords.y}`;
    
    // Vérifier si la tuile est en cache
    const checkCache = async () => {
      try {
        // Vérifier d'abord dans le cache mémoire
        if (this._tileCache.has(tileKey)) {
          const cached = this._tileCache.get(tileKey);
          if (cached) {
            this._setTileImage(tile, cached);
            done();
            return true;
          }
        }
        
        // Vérifier dans IndexedDB
        const tileData = await mapTileManager.getTile(coords.z, coords.x, coords.y, this._source);
        if (tileData && tileData.data) {
          const blob = new Blob([tileData.data], { type: this._getMimeType(tileData.format) });
          const url = URL.createObjectURL(blob);
          
          // Mettre en cache en mémoire
          this._tileCache.set(tileKey, url);
          
          // Configurer l'image
          this._setTileImage(tile, url);
          done();
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('Error checking tile cache:', error);
        return false;
      }
    };
    
    // Essayer de charger depuis le cache
    checkCache().then((foundInCache) => {
      if (!foundInCache) {
        // Si pas en cache, charger depuis le réseau (si en ligne) ou afficher une tuile d'erreur
        if (navigator.onLine) {
          this._loadTileFromNetwork(coords, tile, done);
        } else {
          this._showErrorTile(tile);
          done();
        }
      }
    });
    
    return tile;
  }
  
  private _setTileImage(tile: HTMLElement, src: string | HTMLImageElement) {
    if (typeof src === 'string') {
      tile.style.backgroundImage = `url(${src})`;
    } else if (src instanceof HTMLImageElement) {
      tile.appendChild(src);
    }
  }
  
  private _getMimeType(format: string): string {
    switch (format) {
      case 'png': return 'image/png';
      case 'jpeg':
      case 'jpg': return 'image/jpeg';
      case 'pbf': return 'application/x-protobuf';
      case 'mvt': return 'application/x-protobuf';
      default: return 'application/octet-stream';
    }
  }
  
  private async _loadTileFromNetwork(
    coords: { x: number; y: number; z: number },
    tile: HTMLElement,
    done: () => void
  ) {
    const { x, y, z } = coords;
    const tileKey = `${z}/${x}/${y}`;
    
    // Éviter les chargements en double
    if (this._loadingTiles[tileKey]) return;
    this._loadingTiles[tileKey] = true;
    
    try {
      const tileUrl = this.getTileUrl(coords);
      
      // Créer une image pour charger la tuile
      const img = new Image();
      
      // Gérer le CORS si nécessaire
      if (this.options.crossOrigin) {
        img.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
      }
      
      // Configurer les gestionnaires d'événements
      img.onload = async () => {
        try {
          // Mettre en cache la tuile chargée
          this._tileCache.set(tileKey, img);
          
          // Stocker la tuile dans IndexedDB pour une utilisation ultérieure
          const response = await fetch(tileUrl);
          const arrayBuffer = await response.arrayBuffer();
          
          await mapTileManager.storeTile({
            z,
            x,
            y,
            data: arrayBuffer,
            format: this._getFormatFromUrl(tileUrl),
            source: this._source as any,
          });
          
          // Mettre à jour l'affichage
          this._setTileImage(tile, img);
          done();
        } catch (error) {
          console.error('Error caching tile:', error);
          this._showErrorTile(tile);
          done();
        } finally {
          delete this._loadingTiles[tileKey];
        }
      };
      
      img.onerror = () => {
        console.error(`Failed to load tile: ${tileUrl}`);
        this._showErrorTile(tile);
        done();
        delete this._loadingTiles[tileKey];
      };
      
      // Démarrer le chargement
      img.src = tileUrl;
      
    } catch (error) {
      console.error('Error loading tile:', error);
      this._showErrorTile(tile);
      done();
      delete this._loadingTiles[tileKey];
    }
  }
  
  private _getFormatFromUrl(url: string): 'png' | 'jpeg' | 'pbf' | 'mvt' {
    if (url.endsWith('.png')) return 'png';
    if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return 'jpeg';
    if (url.endsWith('.pbf')) return 'pbf';
    if (url.endsWith('.mvt')) return 'mvt';
    return 'png'; // Par défaut
  }
  
  private _showErrorTile(tile: HTMLElement) {
    // Afficher une tuile d'erreur ou un fond de secours
    tile.style.background = '#f0f0f0';
    tile.style.border = '1px solid #ccc';
    tile.style.display = 'flex';
    tile.style.alignItems = 'center';
    tile.style.justifyContent = 'center';
    tile.style.color = '#999';
    tile.style.fontSize = '10px';
    tile.textContent = 'No Data';
  }
  
  // Méthodes utilitaires
  async preloadArea(bounds: [number, number, number, number], zoomLevels: number[]) {
    await mapTileManager.preloadTiles(bounds, zoomLevels, this._source);
  }
  
  clearTileCache() {
    this._tileCache.clear();
    return mapTileManager.clearCache();
  }
  
  getCacheStats() {
    return mapTileManager.getCacheStats();
  }
  
  // Surcharge de la méthode getTileUrl pour utiliser la source configurée
  getTileUrl(coords: { x: number; y: number; z: number }): string {
    // Implémentation de base - à personnaliser selon vos besoins
    const { x, y, z } = coords;
    
    // Exemple avec OpenStreetMap
    if (this._source === 'osm') {
      return `https://{s}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }
    
    // Exemple avec Mapbox
    if (this._source.startsWith('mapbox')) {
      const styleId = this._source.split(':')[1] || 'streets-v11';
      return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/${z}/${x}/${y}@2x?access_token=YOUR_MAPBOX_TOKEN`;
    }
    
    // Pour les sources personnalisées
    return this._source
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString())
      .replace('{-y}', (Math.pow(2, z) - y - 1).toString());
  }
}

// Enregistrer la couche personnalisée pour une utilisation avec L.tileLayer.offline
declare global {
  namespace L {
    function offlineTileLayer(source: string, options?: OfflineTileLayerOptions): OfflineTileLayer;
  }
}

// Étendre Leaflet avec notre couche personnalisée
L.offlineTileLayer = function(source: string, options?: OfflineTileLayerOptions) {
  return new OfflineTileLayer(source, options);
};

export default OfflineTileLayer;
