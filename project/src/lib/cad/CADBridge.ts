import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as proj4 from 'proj4';
import { v4 as uuidv4 } from 'uuid';
import { version } from 'os';

// Types pour les entités CAO
type DWGEntityType = 'POINT' | 'LINE' | 'LWPOLYLINE' | 'CIRCLE' | 'ARC' | 'TEXT' | 'MTEXT' | 'INSERT' | 'DIMENSION' | 'HATCH' | 'IMAGE';

type Point = [number, number];
type Point3D = [number, number, number];

interface DWGEntityBase {
  id: string;
  type: DWGEntityType;
  layer: string;
  color?: number; // Code couleur AutoCAD (1-255)
  lineType?: string;
  lineWeight?: number; // en mm
  handle?: string; // Identifiant unique dans le fichier DWG
  extendedData?: Record<string, any>;
}

interface PointEntity extends DWGEntityBase {
  type: 'POINT';
  position: Point3D;
  thickness?: number;
}

interface LineEntity extends DWGEntityBase {
  type: 'LINE';
  start: Point3D;
  end: Point3D;
}

interface LWPolylineEntity extends DWGEntityBase {
  type: 'LWPOLYLINE';
  vertices: Point[];
  closed: boolean;
  elevation?: number;
  width?: number;
  constantWidth?: boolean;
}

interface TextEntity extends DWGEntityBase {
  type: 'TEXT' | 'MTEXT';
  position: Point3D;
  text: string;
  height: number;
  rotation?: number; // en degrés
  style?: string;
  width?: number;
  attachmentPoint?: number;
}

interface BlockReference extends DWGEntityBase {
  type: 'INSERT';
  blockName: string;
  position: Point3D;
  scale?: [number, number, number];
  rotation?: number; // en degrés
  attributes?: Record<string, string>;
}

interface HatchEntity extends DWGEntityBase {
  type: 'HATCH';
  boundary: Point[][]; // Polygones de délimitation
  pattern?: {
    name: string;
    scale: number;
    angle: number;
  };
  solid: boolean;
}

type DWGEntity = PointEntity | LineEntity | LWPolylineEntity | TextEntity | BlockReference | HatchEntity;

// Définition d'un bloc personnalisé
interface BlockDefinition {
  name: string;
  basePoint: Point3D;
  entities: DWGEntity[];
}

// Options de conversion
type ConversionOptions = {
  sourceCRS?: string; // Système de coordonnées source (ex: 'EPSG:4326')
  targetCRS?: string; // Système de coordonnées cible (ex: 'EPSG:3857')
  layerMapping?: Record<string, string>; // Mappage des noms de couches
  scale?: number; // Facteur d'échelle
  flipY?: boolean; // Inverser l'axe Y (utile pour les conversions entre systèmes de coordonnées)
  precision?: number; // Précision des coordonnées
  defaultLayer?: string; // Couche par défaut pour les entités sans couche
  includeMetadata?: boolean; // Inclure les métadonnées dans les données étendues
};

// Options d'export DWG
type ExportOptions = ConversionOptions & {
  fileName?: string;
  version?: 'R12' | 'R14' | '2000' | '2004' | '2007' | '2010' | '2013' | '2018';
  includeThumbnail?: boolean;
  creator?: string;
  comments?: string;
};

// Options d'import DWG
type ImportOptions = ConversionOptions & {
  extractLayers?: boolean;
  extractBlocks?: boolean;
  extractText?: boolean;
  extractHatches?: boolean;
  maxVerticesPerPolyline?: number;
};

/**
 * Classe principale pour la conversion bidirectionnelle entre objets géographiques et formats CAO
 */
export class CADBridge {
  private static instance: CADBridge;
  private blockDefinitions: Map<string, BlockDefinition> = new Map();
  private layerStyles: Map<string, any> = new Map();
  private textStyles: Map<string, any> = new Map();
  private lineTypes: Map<string, any> = new Map();
  
  private constructor() {
    this.initializeDefaultStyles();
  }

  static getInstance(): CADBridge {
    if (!CADBridge.instance) {
      CADBridge.instance = new CADBridge();
    }
    return CADBridge.instance;
  }

  /**
   * Initialise les styles par défaut
   */
  private initializeDefaultStyles(): void {
    // Styles de couches par défaut
    this.layerStyles.set('0', { color: 7, lineWeight: 0.25, lineType: 'CONTINUOUS' });
    
    // Styles de texte par défaut
    this.textStyles.set('STANDARD', {
      font: 'Arial',
      width: 1.0,
      oblique: 0,
      lastHeight: 2.5,
      generation: 0,
      flags: 0
    });
    
    // Types de ligne par défaut
    this.lineTypes.set('CONTINUOUS', {
      name: 'CONTINUOUS',
      description: 'Solid line',
      pattern: [],
      length: 0
    });
  }

  /**
   * Convertit des objets géographiques en entités DWG
   */
  convertToDWG(
    geoObjects: Array<GeoJSON.Feature>,
    options: ConversionOptions = {}
  ): DWGEntity[] {
    const defaultLayer = options.defaultLayer || '0';
    const entities: DWGEntity[] = [];
    
    for (const geoObj of geoObjects) {
      try {
        const layer = this.getLayerForFeature(geoObj, options);
        const color = this.getColorForFeature(geoObj);
        
        if (!geoObj.geometry) continue;
        
        const baseProps: Partial<DWGEntityBase> = {
          id: geoObj.id as string || uuidv4(),
          layer,
          color,
          extendedData: options.includeMetadata ? geoObj.properties : undefined
        };
        
        switch (geoObj.geometry.type) {
          case 'Point':
            const point = this.convertPoint(geoObj.geometry.coordinates, options);
            entities.push({
              ...baseProps,
              type: 'POINT',
              position: [point[0], point[1], 0]
            } as PointEntity);
            break;
            
          case 'LineString':
            const lineString = this.convertLineString(geoObj.geometry.coordinates, options);
            entities.push({
              ...baseProps,
              type: 'LWPOLYLINE',
              vertices: lineString,
              closed: false
            } as LWPolylineEntity);
            break;
            
          case 'Polygon':
            // Traiter chaque anneau du polygone
            geoObj.geometry.coordinates.forEach((ring: number[][], index: number) => {
              const vertices = this.convertLineString(ring, options);
              entities.push({
                ...baseProps,
                type: 'LWPOLYLINE',
                vertices,
                closed: true,
                layer: index === 0 ? layer : `${layer}_hole${index}`
              } as LWPolylineEntity);
            });
            break;
            
          case 'MultiPoint':
            geoObj.geometry.coordinates.forEach((coord: number[]) => {
              const point = this.convertPoint(coord, options);
              entities.push({
                ...baseProps,
                type: 'POINT',
                position: [point[0], point[1], 0]
              } as PointEntity);
            });
            break;
            
          case 'MultiLineString':
            geoObj.geometry.coordinates.forEach((line: number[][], index: number) => {
              const vertices = this.convertLineString(line, options);
              entities.push({
                ...baseProps,
                type: 'LWPOLYLINE',
                vertices,
                closed: false,
                layer: `${layer}_part${index + 1}`
              } as LWPolylineEntity);
            });
            break;
            
          case 'MultiPolygon':
            geoObj.geometry.coordinates.forEach((polygon: number[][][], polyIndex: number) => {
              polygon.forEach((ring, ringIndex) => {
                const vertices = this.convertLineString(ring, options);
                entities.push({
                  ...baseProps,
                  type: 'LWPOLYLINE',
                  vertices,
                  closed: true,
                  layer: ringIndex === 0 
                    ? `${layer}_poly${polyIndex + 1}` 
                    : `${layer}_poly${polyIndex + 1}_hole${ringIndex}`
                } as LWPolylineEntity);
              });
            });
            break;
            
          case 'GeometryCollection':
            // Traiter chaque géométrie de la collection
            const collectionEntities = this.convertToDWG(
              (geoObj.geometry.geometries || []).map(geom => ({
                ...geoObj,
                geometry: geom
              })),
              options
            );
            entities.push(...collectionEntities);
            break;
        }
        
        // Ajouter du texte si une propriété label est présente
        if (geoObj.properties?.label && geoObj.geometry.type === 'Point') {
          const point = this.convertPoint(geoObj.geometry.coordinates, options);
          entities.push({
            ...baseProps,
            type: 'TEXT',
            position: [point[0], point[1], 0],
            text: geoObj.properties.label,
            height: 2.5,
            style: 'STANDARD'
          } as TextEntity);
        }
      } catch (error) {
        console.error('Erreur lors de la conversion de l\'objet:', geoObj, error);
      }
    }
    
    return entities;
  }
  
  /**
   * Exporte des entités DWG dans un fichier
   */
  async exportDWG(
    entities: DWGEntity[],
    options: ExportOptions = {}
  ): Promise<Buffer> {
    try {
      // Vérifier si nous avons besoin d'une conversion de système de coordonnées
      const needsReprojection = options.sourceCRS && options.targetCRS && 
                              options.sourceCRS !== options.targetCRS;
      
      // Préparer les données pour l'export
      const exportData = {
        header: {
          version: options.version || '2018',
          creator: options.creator || 'CADBridge',
          created: new Date().toISOString(),
          comments: options.comments || '',
          units: 'Meters',
          insbase: [0, 0, 0],
          extmin: this.calculateBoundingBox(entities).min,
          extmax: this.calculateBoundingBox(entities).max,
          limmin: [0, 0],
          limmax: [1000, 1000],
          layers: Array.from(new Set(entities.map(e => e.layer))),
          blocks: Array.from(this.blockDefinitions.values()).map(block => ({
            name: block.name,
            basePoint: block.basePoint,
            entityCount: block.entities.length
          }))
        },
        entities: entities.map(entity => ({
          ...entity,
          // Appliquer la transformation de coordonnées si nécessaire
          ...(entity.type === 'POINT' && {
            position: needsReprojection 
              ? this.transformCoordinates(entity.position, options.sourceCRS!, options.targetCRS!)
              : entity.position
          }),
          // Traiter les autres types d'entités de manière similaire...
        })),
        blocks: Array.from(this.blockDefinitions.values())
      };
      
      // Dans une implémentation réelle, on utiliserait une bibliothèque comme 'dwg2dxf' ou 'teigha-file-converter'
      // Ici, on simule la génération d'un fichier DWG
      const dwgContent = this.simulateDWGGeneration(exportData);
      
      return Buffer.from(dwgContent);
    } catch (error) {
      console.error('Erreur lors de l\'export DWG:', error);
      throw new Error(`Échec de l'export DWG: ${error}`);
    }
  }
  
  /**
   * Importe un fichier DWG/DXF et le convertit en entités géographiques
   */
  async importDWG(
    file: Buffer,
    options: ImportOptions = {}
  ): Promise<GeoJSON.FeatureCollection> {
    try {
      // Dans une implémentation réelle, on utiliserait une bibliothèque pour lire le fichier DWG/DXF
      const dwgData = await this.parseDWGFile(file, options);
      
      const features: GeoJSON.Feature[] = [];
      
      // Convertir chaque entité DWG en feature GeoJSON
      for (const entity of dwgData.entities) {
        try {
          const feature = this.convertDWGEntityToGeoJSON(entity, options);
          if (feature) {
            features.push(feature);
          }
        } catch (error) {
          console.warn(`Impossible de convertir l'entité DWG:`, entity, error);
        }
      }
      
      return {
        type: 'FeatureCollection',
        features
      };
    } catch (error) {
      console.error('Erreur lors de l\'import DWG:', error);
      throw new Error(`Échec de l'import DWG: ${error}`);
    }
  }
  
  // Méthodes d'aide pour la conversion
  
  private getLayerForFeature(
    feature: GeoJSON.Feature,
    options: ConversionOptions
  ): string {
    if (feature.properties?.layer) {
      return options.layerMapping?.[feature.properties.layer] || feature.properties.layer;
    }
    return options.defaultLayer || '0';
  }
  
  private getColorForFeature(feature: GeoJSON.Feature): number {
    // Convertir les couleurs CSS en codes de couleur AutoCAD (1-255)
    const colorMap: Record<string, number> = {
      'red': 1,
      'yellow': 2,
      'green': 3,
      'cyan': 4,
      'blue': 5,
      'magenta': 6,
      'white': 7,
      'black': 7,
      'gray': 8,
      'grey': 8,
      'brown': 15,
      'orange': 40
    };
    
    if (feature.properties?.color) {
      return colorMap[feature.properties.color.toLowerCase()] || 7; // Par défaut blanc
    }
    
    return 7; // Couleur par défaut (blanc)
  }
  
  private convertPoint(coord: number[], options: ConversionOptions): [number, number] {
    let [x, y] = coord;
    
    // Appliquer la transformation de coordonnées si nécessaire
    if (options.sourceCRS && options.targetCRS && options.sourceCRS !== options.targetCRS) {
      [x, y] = proj4(options.sourceCRS, options.targetCRS, [x, y]);
    }
    
    // Appliquer l'échelle si spécifiée
    if (options.scale) {
      x *= options.scale;
      y *= options.scale;
    }
    
    // Inverser l'axe Y si nécessaire (pour certains systèmes de coordonnées)
    if (options.flipY) {
      y = -y;
    }
    
    // Appliquer la précision si spécifiée
    const precision = options.precision ?? 6;
    return [
      parseFloat(x.toFixed(precision)),
      parseFloat(y.toFixed(precision))
    ];
  }
  
  private convertLineString(coords: number[][], options: ConversionOptions): Point[] {
    return coords.map(coord => this.convertPoint(coord, options));
  }
  
  private calculateBoundingBox(entities: DWGEntity[]): { min: Point3D; max: Point3D } {
    let minX = Infinity, minY = Infinity, minZ = 0;
    let maxX = -Infinity, maxY = -Infinity, maxZ = 0;
    
    const processPoint = (point: Point3D) => {
      const [x, y, z = 0] = point;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    };
    
    for (const entity of entities) {
      switch (entity.type) {
        case 'POINT':
          processPoint(entity.position);
          break;
          
        case 'LINE':
          processPoint(entity.start);
          processPoint(entity.end);
          break;
          
        case 'LWPOLYLINE':
          entity.vertices.forEach(vertex => {
            processPoint([vertex[0], vertex[1], entity.elevation || 0]);
          });
          break;
          
        case 'TEXT':
        case 'MTEXT':
          processPoint([
            entity.position[0],
            entity.position[1],
            entity.position[2] || 0
          ]);
          break;
          
        case 'INSERT':
          processPoint(entity.position);
          // TODO: Prendre en compte la taille du bloc référencé
          break;
      }
    }
    
    return {
      min: [minX, minY, minZ] as Point3D,
      max: [maxX, maxY, maxZ] as Point3D
    };
  }
  
  private transformCoordinates(
    coords: number[],
    sourceCRS: string,
    targetCRS: string
  ): number[] {
    try {
      return proj4(sourceCRS, targetCRS, coords);
    } catch (error) {
      console.warn(`Échec de la transformation de coordonnées de ${sourceCRS} vers ${targetCRS}:`, error);
      return coords; // Retourner les coordonnées d'origine en cas d'erreur
    }
  }
  
  // Méthodes de simulation (à remplacer par des appels à des bibliothèques réelles)
  
  private simulateDWGGeneration(data: any): string {
    // Dans une implémentation réelle, on utiliserait une bibliothèque comme 'dwg2dxf' ou 'teigha-file-converter'
    console.log('Génération du fichier DWG avec les données:', data);
    
    // Simuler la génération d'un fichier DWG binaire
    const header = `DWG_HEADER:${JSON.stringify(data.header)}`;
    const entities = `ENTITIES:${data.entities.length}`;
    const blocks = `BLOCKS:${data.blocks.length}`;
    
    return [header, entities, blocks].join('|');
  }
  
  private async parseDWGFile(
    file: Buffer,
    options: ImportOptions
  ): Promise<{ entities: any[] }> {
    // Dans une implémentation réelle, on utiliserait une bibliothèque pour lire le fichier DWG
    console.log('Analyse du fichier DWG, taille:', file.length);
    
    // Simuler l'analyse du fichier et retourner des entités factices
    return {
      entities: [
        {
          type: 'LWPOLYLINE',
          vertices: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
          layer: '0',
          color: 7
        }
      ]
    };
  }
  
  private convertDWGEntityToGeoJSON(
    entity: any,
    options: ImportOptions
  ): GeoJSON.Feature | null {
    const properties: Record<string, any> = {
      layer: entity.layer || '0',
      color: entity.color || 7,
      ...(entity.extendedData || {})
    };
    
    let geometry: GeoJSON.Geometry | null = null;
    
    switch (entity.type) {
      case 'POINT':
        geometry = {
          type: 'Point',
          coordinates: [entity.position[0], entity.position[1]]
        };
        break;
        
      case 'LINE':
        geometry = {
          type: 'LineString',
          coordinates: [
            [entity.start[0], entity.start[1]],
            [entity.end[0], entity.end[1]]
          ]
        };
        break;
        
      case 'LWPOLYLINE':
        if (entity.vertices.length < 2) return null;
        
        const coordinates = entity.vertices.map((v: any) => [v[0], v[1]]);
        
        if (entity.closed && coordinates.length > 2) {
          // Fermer la polyligne si nécessaire
          const first = coordinates[0];
          const last = coordinates[coordinates.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            coordinates.push([...first]);
          }
          
          geometry = {
            type: 'Polygon',
            coordinates: [coordinates]
          };
        } else {
          geometry = {
            type: 'LineString',
            coordinates
          };
        }
        break;
        
      case 'TEXT':
      case 'MTEXT':
        // Pour le texte, on crée un point avec la propriété de texte
        geometry = {
          type: 'Point',
          coordinates: [entity.position[0], entity.position[1]]
        };
        properties.text = entity.text;
        properties.textHeight = entity.height;
        properties.textRotation = entity.rotation || 0;
        break;
        
      case 'INSERT':
        // Pour les blocs, on pourrait les développer ou les référencer
        geometry = {
          type: 'Point',
          coordinates: [entity.position[0], entity.position[1]]
        };
        properties.blockName = entity.blockName;
        properties.blockScale = entity.scale || [1, 1, 1];
        properties.blockRotation = entity.rotation || 0;
        break;
        
      default:
        console.warn(`Type d'entité non supporté: ${entity.type}`);
        return null;
    }
    
    if (!geometry) return null;
    
    return {
      type: 'Feature',
      id: entity.id || uuidv4(),
      properties,
      geometry
    };
  }
  
  // Méthodes pour gérer les blocs et les styles
  
  /**
   * Définit un bloc personnalisé qui peut être réutilisé dans le dessin
   */
  defineBlock(definition: BlockDefinition): void {
    if (this.blockDefinitions.has(definition.name)) {
      console.warn(`Le bloc '${definition.name}' existe déjà et sera remplacé`);
    }
    this.blockDefinitions.set(definition.name, definition);
  }
  
  /**
   * Charge des définitions de blocs à partir d'un fichier
   */
  async loadBlocksFromFile(filePath: string): Promise<void> {
    try {
      const content = await promisify(fs.readFile)(filePath, 'utf-8');
      const blocks = JSON.parse(content);
      
      if (Array.isArray(blocks)) {
        blocks.forEach(block => this.defineBlock(block));
      } else {
        Object.entries(blocks).forEach(([name, def]) => 
          this.defineBlock({ name, ...(def as Omit<BlockDefinition, 'name'>) })
        );
      }
      
      console.log(`Chargement de ${Object.keys(blocks).length} blocs depuis ${filePath}`);
    } catch (error) {
      console.error(`Erreur lors du chargement des blocs depuis ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * Définit un style de couche
   */
  setLayerStyle(layerName: string, style: any): void {
    this.layerStyles.set(layerName, style);
  }
  
  /**
   * Définit un style de texte
   */
  setTextStyle(styleName: string, style: any): void {
    this.textStyles.set(styleName, style);
  }
  
  /**
   * Définit un type de ligne personnalisé
   */
  setLineType(typeName: string, pattern: number[], description: string = ''): void {
    this.lineTypes.set(typeName, {
      name: typeName,
      description,
      pattern,
      length: pattern.reduce((sum, val) => sum + Math.abs(val), 0)
    });
  }
}
