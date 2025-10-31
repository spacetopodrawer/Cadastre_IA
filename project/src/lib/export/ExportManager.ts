import * as JSZip from 'jszip';
import * as shpwrite from 'shp-write';
import { versionTracker } from '../api/VersionTracker';
import { CorrectionVisualizer } from '../visualization/CorrectionVisualizer';
import * as dbf from 'dbf';
import * as proj4 from 'proj4';
import * as toGeoJSON from 'togeojson';
import * as kmlParser from 'kml-parser';
import * as gpxParser from 'gpx-parse';
import { CADBridge } from '../cad/CADBridge';
import { v4 as uuidv4 } from 'uuid';

// Extend GeoJSON types to include id
import { Feature, FeatureCollection } from 'geojson';

declare module 'geojson' {
  interface Feature<G = GeoJSON.Geometry | null, P = { [name: string]: any }> {
    id?: string | number;
    properties: P;
  }
}

/**
 * Types d'export supportés
 */
type ExportFormat = 'GeoJSON' | 'KML' | 'GPX' | 'Shapefile' | 'DWG' | 'DXF' | 'CSV' | 'PDF';
type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'GeometryCollection';

/**
 * Options d'export
 */
/**
 * Options d'export pour les formats CAO (DWG/DXF)
 */
interface CADExportOptions {
  version?: 'R12' | 'R14' | '2000' | '2004' | '2007' | '2010' | '2013' | '2018';
  includeThumbnail?: boolean;
  creator?: string;
  comments?: string;
  scale?: number;
  flipY?: boolean;
}

/**
 * Options d'export
 */
interface ExportOptions {
  format: ExportFormat;
  missionId?: string;
  userId?: string;
  bbox?: [number, number, number, number]; // [minX, minY, maxX, maxY]
  layers?: string[];
  includeMetadata?: boolean;
  includeValidation?: boolean;
  versionId?: string;
  style?: {
    [key: string]: any;
  };
  coordinateSystem?: 'WGS84' | 'Lambert93' | 'UTM' | 'WebMercator';
  precision?: number;
  simplifyTolerance?: number;
  scale?: number;
  cadOptions?: CADExportOptions;
}

/**
 * Résultat d'export
 */
interface ExportResult {
  format: string;
  content: string | ArrayBuffer | Blob;
  filename: string;
  size: number;
  mimeType: string;
  metadata: {
    featureCount: number;
    exportedAt: string;
    coordinateSystem: string;
    bbox?: [number, number, number, number];
  };
}

/**
 * Classe principale pour la gestion des exports
 */
export class ExportManager {
  private static instance: ExportManager;
  
  // Cache pour les exports fréquents
  private exportCache: Map<string, ExportResult> = new Map();
  
  private constructor() {}

  static getInstance(): ExportManager {
    if (!ExportManager.instance) {
      ExportManager.instance = new ExportManager();
    }
    return ExportManager.instance;
  }

  /**
   * Exporte des objets géographiques dans le format demandé
   */
  async export(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): Promise<ExportResult> {
    // Vérifier le cache
    const cacheKey = this.generateCacheKey(features, options);
    const cached = this.exportCache.get(cacheKey);
    if (cached) return cached;

    // Préparer les données
    const preparedFeatures = this.prepareFeatures(features, options);
    
    // Exporter dans le format demandé
    let result: ExportResult;
    
    switch (options.format) {
      case 'GeoJSON':
        result = await this.exportGeoJSON(preparedFeatures, options);
        break;
        
      case 'KML':
        result = await this.exportKML(preparedFeatures, options);
        break;
        
      case 'GPX':
        result = await this.exportGPX(preparedFeatures, options);
        break;
        
      case 'Shapefile':
        result = await this.exportShapefile(preparedFeatures, options);
        break;
        
      case 'DWG':
      case 'DXF':
        result = await this.exportCAD(preparedFeatures, options);
        break;
        
      case 'CSV':
        result = await this.exportCSV(preparedFeatures, options);
        break;
        
      case 'PDF':
        result = await this.exportPDF(preparedFeatures, options);
        break;
        
      default:
        throw new Error(`Format d'export non supporté: ${options.format}`);
    }
    
    // Mettre en cache le résultat
    this.exportCache.set(cacheKey, result);
    
    return result;
  }

  /**
   * Exporte une version spécifique d'une mission
   */
  async exportVersion(versionId: string, options: Omit<ExportOptions, 'versionId'>): Promise<ExportResult> {
    const version = versionTracker.getVersion(options.missionId || '', versionId);
    if (!version) {
      throw new Error(`Version ${versionId} non trouvée`);
    }
    
    // Convertir les changements en features GeoJSON
    const features = version.changes.map(change => ({
      type: 'Feature',
      properties: {
        action: change.action,
        objectId: change.objectId,
        timestamp: new Date(change.timestamp).toISOString(),
        userId: change.userId,
        ...(change.after?.properties || {})
      },
      geometry: change.after?.geometry || null
    }));
    
    return this.export(features, { ...options, versionId });
  }

  /**
   * Exporte une visualisation
   */
  async exportVisualization(
    visualizationId: string, 
    format: 'PNG' | 'SVG' | 'PDF' | 'CSV',
    options?: Partial<ExportOptions>
  ): Promise<ExportResult> {
    const visualizer = new CorrectionVisualizer();
    let content: string;
    
    switch (format) {
      case 'CSV':
        content = visualizer.exportGraph(visualizationId, 'CSV');
        return {
          format: 'CSV',
          content,
          filename: `visualization_${visualizationId}_${Date.now()}.csv`,
          size: new TextEncoder().encode(content).length,
          mimeType: 'text/csv',
          metadata: {
            featureCount: 1,
            exportedAt: new Date().toISOString(),
            coordinateSystem: 'n/a',
          }
        };
        
      // Autres formats à implémenter avec des bibliothèques de rendu
      default:
        throw new Error(`Format d'export de visualisation non supporté: ${format}`);
    }
  }

  // Méthodes d'export spécifiques au format
  
  private async exportGeoJSON(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): Promise<ExportResult> {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.transformCoordinates(features, options.coordinateSystem)
    };
    
    const content = JSON.stringify(geojson, null, 2);
    
    return {
      format: 'GeoJSON',
      content,
      filename: this.generateFilename('geojson', options),
      size: new TextEncoder().encode(content).length,
      mimeType: 'application/geo+json',
      metadata: this.generateMetadata(features, options)
    };
  }
  
  private async exportKML(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): Promise<ExportResult> {
    // Convertir GeoJSON en KML
    const kml = this.convertToKML(features, options);
    
    return {
      format: 'KML',
      content: kml,
      filename: this.generateFilename('kml', options),
      size: new TextEncoder().encode(kml).length,
      mimeType: 'application/vnd.google-earth.kml+xml',
      metadata: this.generateMetadata(features, options)
    };
  }
  
  private async exportGPX(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): Promise<ExportResult> {
    // Convertir GeoJSON en GPX
    const gpx = this.convertToGPX(features, options);
    
    return {
      format: 'GPX',
      content: gpx,
      filename: this.generateFilename('gpx', options),
      size: new TextEncoder().encode(gpx).length,
      mimeType: 'application/gpx+xml',
      metadata: this.generateMetadata(features, options)
    };
  }
  
  private async exportShapefile(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): Promise<ExportResult> {
    // Créer un shapefile avec shp-write
    const zip = new JSZip();
    const shpData = shpwrite.zip({
      type: 'FeatureCollection',
      features: this.transformCoordinates(features, 'WGS84') // Shapefile utilise WGS84
    });
    
    // Convertir en ArrayBuffer pour le téléchargement
    const content = await shpData.generateAsync({ type: 'arraybuffer' });
    
    return {
      format: 'Shapefile',
      content,
      filename: this.generateFilename('zip', options),
      size: content.byteLength,
      mimeType: 'application/zip',
      metadata: this.generateMetadata(features, options)
    };
  }
  
  private async exportCAD(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): Promise<ExportResult> {
    // Intégration avec une API ou un service de conversion
    // Ceci est un exemple simplifié
    const cadData = await this.convertToCAD(features, options.format as 'DWG' | 'DXF');
    
    return {
      format: options.format,
      content: cadData,
      filename: this.generateFilename(options.format.toLowerCase() as string, options),
      size: cadData.byteLength || cadData.length,
      mimeType: options.format === 'DWG' ? 'application/acad' : 'application/dxf',
      metadata: this.generateMetadata(features, options)
    };
  }
  
  private async exportCSV(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): Promise<ExportResult> {
    // Convertir GeoJSON en CSV
    const csv = this.convertToCSV(features, options);
    
    return {
      format: 'CSV',
      content: csv,
      filename: this.generateFilename('csv', options),
      size: new TextEncoder().encode(csv).length,
      mimeType: 'text/csv',
      metadata: this.generateMetadata(features, options)
    };
  }
  
  private async exportPDF(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): Promise<ExportResult> {
    // Générer un PDF avec une carte et une légende
    // Ceci est un exemple simplifié
    const pdfData = await this.generatePDF(features, options);
    
    return {
      format: 'PDF',
      content: pdfData,
      filename: this.generateFilename('pdf', options),
      size: pdfData.byteLength || pdfData.length,
      mimeType: 'application/pdf',
      metadata: this.generateMetadata(features, options)
    };
  }

  // Méthodes utilitaires
  
  private prepareFeatures(
    features: GeoJSON.Feature[], 
    options: ExportOptions
  ): GeoJSON.Feature[] {
    return features
      .filter(feature => {
        // Filtrer par couches si spécifié
        if (options.layers && options.layers.length > 0) {
          const layer = feature.properties?.layer;
          return layer && options.layers.includes(layer);
        }
        return true;
      })
      .map(feature => ({
        ...feature,
        properties: options.includeMetadata 
          ? feature.properties 
          : this.filterMetadata(feature.properties, options)
      }));
  }
  
  private filterMetadata(properties: any, options: ExportOptions): any {
    if (!properties) return {};
    
    // Liste des propriétés à toujours inclure
    const defaultProps = ['id', 'name', 'description', 'timestamp'];
    const filtered: Record<string, any> = {};
    
    for (const prop of defaultProps) {
      if (prop in properties) {
        filtered[prop] = properties[prop];
      }
    }
    
    // Ajouter les propriétés spécifiées dans les options
    if (options.includeValidation) {
      filtered.validation = properties.validation;
    }
    
    return filtered;
  }
  
  private transformCoordinates(
    features: GeoJSON.Feature[],
    targetCrs: string = 'WGS84'
  ): GeoJSON.Feature[] {
    if (!targetCrs || targetCrs === 'WGS84') {
      return features; // Pas de transformation nécessaire
    }
    
    // Implémenter la transformation de coordonnées avec proj4
    // Ceci est un exemple simplifié
    return features.map(feature => {
      if (!feature.geometry) return feature;
      
      const transformed = JSON.parse(JSON.stringify(feature));
      
      // Appliquer la transformation aux coordonnées
      // Note: Implémentation simplifiée, à compléter avec proj4
      
      return transformed;
    });
  }
  
  private generateFilename(extension: string, options: ExportOptions): string {
    const parts = ['export'];
    
    if (options.missionId) {
      parts.push(options.missionId);
    }
    
    if (options.versionId) {
      parts.push(`v${options.versionId}`);
    }
    
    parts.push(new Date().toISOString().split('T')[0]);
    parts.push(`.${extension}`);
    
    return parts.join('_').toLowerCase();
  }
  
  private generateMetadata(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): ExportResult['metadata'] {
    const bbox = this.calculateBoundingBox(features);
    
    return {
      featureCount: features.length,
      exportedAt: new Date().toISOString(),
      coordinateSystem: options.coordinateSystem || 'WGS84',
      bbox: bbox.length ? (bbox as [number, number, number, number]) : undefined
    };
  }
  
  private calculateBoundingBox(features: GeoJSON.Feature[]): number[] {
    if (!features.length) return [];
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const processCoordinates = (coords: any[]): void => {
      if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
        // C'est un tableau de coordonnées
        coords.forEach(coord => processCoordinates(coord));
      } else if (typeof coords[0] === 'number' && coords.length >= 2) {
        // C'est une paire de coordonnées [x, y, ...]
        const [x, y] = coords;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    };
    
    features.forEach(feature => {
      if (!feature.geometry) return;
      
      const coords = (feature.geometry as any).coordinates;
      if (coords) {
        processCoordinates(coords);
      }
    });
    
    return [minX, minY, maxX, maxY];
  }
  
  private generateCacheKey(
    features: GeoJSON.Feature[],
    options: ExportOptions
  ): string {
    const keyParts = [
      options.format,
      options.missionId,
      options.versionId,
      options.coordinateSystem,
      JSON.stringify(options.bbox),
      options.layers?.join(','),
      options.includeMetadata,
      options.includeValidation,
      features.length,
      // Prendre en compte les IDs des 10 premiers features pour le cache
      ...features.slice(0, 10).map(f => f.id || f.properties?.id)
    ].filter(Boolean);
    
    return keyParts.join('|');
  }
  
  // Méthodes de conversion (implémentations simplifiées)
  
  private convertToKML(features: GeoJSON.Feature[], options: ExportOptions): string {
    // Implémentation simplifiée - utiliser une bibliothèque comme tokml en production
    const placemarks = features.map(feature => {
      const coords = this.extractCoordinates(feature);
      if (!coords) return '';
      
      return `
        <Placemark>
          <name>${feature.properties?.name || feature.id || ''}</name>
          <description>
            <![CDATA[
              ${this.propertiesToHTML(feature.properties)}
            ]]>
          </description>
          ${this.geometryToKML(feature.geometry as any)}
        </Placemark>
      `;
    }).join('\n');
    
    return `
      <?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <name>Export ${new Date().toISOString()}</name>
          ${placemarks}
          ${this.generateKMLLineStyles()}
        </Document>
      </kml>
    `;
  }
  
  private convertToGPX(features: GeoJSON.Feature[], options: ExportOptions): string {
    // Implémentation simplifiée
    const waypoints = features.map(feature => {
      const coords = this.extractCoordinates(feature);
      if (!coords) return '';
      
      return `
        <wpt lat="${coords[1]}" lon="${coords[0]}">
          <name>${feature.properties?.name || feature.id || ''}</name>
          <desc>${JSON.stringify(feature.properties)}</desc>
        </wpt>
      `;
    }).join('\n');
    
    return `
      <?xml version="1.0" encoding="UTF-8"?>
      <gpx 
        version="1.1" 
        creator="Cadastre IA Export Manager"
        xmlns="http://www.topografix.com/GPX/1/1"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
        <metadata>
          <time>${new Date().toISOString()}</time>
        </metadata>
        ${waypoints}
      </gpx>
    `;
  }
  
  private convertToCSV(features: GeoJSON.Feature[], options: ExportOptions): string {
    if (features.length === 0) return '';
    
    // Collecter toutes les propriétés uniques
    const allProperties = new Set<string>();
    features.forEach(feature => {
      if (feature.properties) {
        Object.keys(feature.properties).forEach(prop => allProperties.add(prop));
      }
    });
    
    const properties = Array.from(allProperties);
    const headers = ['id', 'type', 'geometry', ...properties];
    
    // Créer les lignes CSV
    const rows = features.map(feature => {
      const row: any[] = [
        feature.id || '',
        feature.geometry?.type || '',
        JSON.stringify(feature.geometry)
      ];
      
      // Ajouter les propriétés dans le même ordre que les en-têtes
      properties.forEach(prop => {
        row.push(feature.properties?.[prop] ?? '');
      });
      
      return row.map(cell => {
        // Échapper les guillemets et les virgules
        const str = String(cell);
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',');
    });
    
    return [
      headers.join(','),
      ...rows
    ].join('\n');
  }
  
  private async convertToCAD(
    features: GeoJSON.Feature[], 
    format: 'DWG' | 'DXF',
    options: ExportOptions = {}
  ): Promise<ArrayBuffer> {
    try {
      // Initialize CADBridge
      const cadBridge = CADBridge.getInstance();
      
      // Convert GeoJSON features to DWG entities
      const dwgEntities = cadBridge.convertToDWG(features, {
        sourceCRS: 'EPSG:4326', // Assuming input is WGS84
        targetCRS: 'EPSG:3857', // Web Mercator for CAD
        layerMapping: options.layers?.reduce((acc, layer) => ({
          ...acc,
          [layer]: layer // Map layer names 1:1 by default
        }), {}),
        defaultLayer: '0',
        includeMetadata: options.includeMetadata,
        precision: options.precision,
        scale: options.scale
      });

      // Export to the requested format
      if (format === 'DWG') {
        const dwgBuffer = await cadBridge.exportDWG(dwgEntities, {
          fileName: options.missionId ? `export_${options.missionId}` : 'export',
          version: '2018', // Default to a modern DWG version
          creator: 'Cadastre IA',
          comments: `Exported on ${new Date().toISOString()}`,
          ...options.cadOptions
        });
        return Buffer.from(dwgBuffer);
      } else {
        // For DXF, we'll need to implement this in CADBridge
        throw new Error('DXF export is not yet implemented');
      }
    } catch (error) {
      console.error('Error converting to CAD format:', error);
      throw new Error(`Failed to convert to ${format}: ${error.message}`);
    }
  }
  
  private async generatePDF(
    features: GeoJSON.Feature[], 
    options: ExportOptions
  ): Promise<ArrayBuffer> {
    // Implémentation factice - à remplacer par une bibliothèque comme PDFKit ou jsPDF
    return new ArrayBuffer(0);
  }
  
  // Méthodes d'aide pour la conversion
  
  private extractCoordinates(feature: GeoJSON.Feature): [number, number] | null {
    if (!feature.geometry) return null;
    
    const geom = feature.geometry as any;
    
    // Extraire les coordonnées en fonction du type de géométrie
    switch (geom.type) {
      case 'Point':
        return [geom.coordinates[0], geom.coordinates[1]];
      case 'LineString':
      case 'MultiPoint':
        return [geom.coordinates[0][0], geom.coordinates[0][1]];
      case 'Polygon':
      case 'MultiLineString':
        return [geom.coordinates[0][0][0], geom.coordinates[0][0][1]];
      case 'MultiPolygon':
        return [geom.coordinates[0][0][0][0], geom.coordinates[0][0][0][1]];
      default:
        return null;
    }
  }
  
  private geometryToKML(geometry: GeoJSON.Geometry): string {
    if (!geometry) return '';
    
    switch (geometry.type) {
      case 'Point':
        const [lon, lat] = (geometry as GeoJSON.Point).coordinates;
        return `
          <Point>
            <coordinates>${lon},${lat}</coordinates>
          </Point>
        `;
      
      case 'LineString':
        const lineCoords = (geometry as GeoJSON.LineString).coordinates
          .map(([lon, lat]) => `${lon},${lat}`)
          .join(' ');
        return `
          <LineString>
            <coordinates>${lineCoords}</coordinates>
          </LineString>
        `;
      
      // Ajouter d'autres types de géométrie au besoin
      
      default:
        console.warn(`Type de géométrie non supporté pour KML: ${geometry.type}`);
        return '';
    }
  }
  
  private propertiesToHTML(properties: any): string {
    if (!properties) return '';
    
    return Object.entries(properties)
      .map(([key, value]) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `<b>${key}:</b> ${val}<br/>`;
      })
      .join('\n');
  }
  
  private generateKMLLineStyles(): string {
    // Générer des styles pour les lignes et polygones
    return `
      <Style id="yellowLineGreenPoly">
        <LineStyle>
          <color>7f00ffff</color>
          <width>4</width>
        </LineStyle>
        <PolyStyle>
          <color>7f00ff00</color>
        </PolyStyle>
      </Style>
    `;
  }
}
