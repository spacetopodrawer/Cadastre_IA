import * as THREE from 'three';

/**
 * Types de graphiques disponibles
 */
type GraphType = 'residuals' | 'dop' | 'convergence' | 'snr' | 'elevation';
type ExportFormat = 'PNG' | 'SVG' | 'CSV' | 'GEOJSON';
type ColorScale = 'viridis' | 'plasma' | 'inferno' | 'magma' | 'cividis' | 'custom';

/**
 * Point de données temporelles
 */
type TimeSeriesPoint = {
  timestamp: number;
  value: number;
  meta?: Record<string, any>;
};

/**
 * Configuration d'un graphique
 */
interface GraphConfig {
  id: string;
  type: GraphType;
  title: string;
  xLabel: string;
  yLabel: string;
  color: string;
  lineWidth: number;
  showLegend: boolean;
  showGrid: boolean;
  animationDuration: number;
}

/**
 * Données du graphique
 */
interface GraphData {
  config: GraphConfig;
  series: {
    name: string;
    data: TimeSeriesPoint[];
    color?: string;
  }[];
}

/**
 * Point de données pour carte thématique
 */
interface ThematicPoint {
  id: string;
  lat: number;
  lon: number;
  value: number;
  color: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Configuration de la carte thématique
 */
interface ThematicMapConfig {
  id: string;
  title: string;
  colorScale: ColorScale;
  customColors?: string[];
  opacity: number;
  pointRadius: number;
  showLegend: boolean;
}

/**
 * Classe principale pour la visualisation des corrections
 */
export class CorrectionVisualizer {
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private animationFrameId: number | null = null;
  
  private graphs: Map<string, GraphData> = new Map();
  private thematicMaps: Map<string, ThematicPoint[]> = new Map();
  private mapConfigs: Map<string, ThematicMapConfig> = new Map();

  /**
   * Initialise le rendu WebGL
   */
  initializeWebGL(container: HTMLElement): void {
    // Configuration de la scène Three.js
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    
    // Configuration de base de la caméra
    this.camera.position.z = 50;
    
    // Gestion du redimensionnement
    window.addEventListener('resize', () => this.handleResize(container));
    
    // Démarrage de la boucle de rendu
    this.animate();
  }

  /**
   * Gère le redimensionnement du conteneur
   */
  private handleResize(container: HTMLElement): void {
    if (!this.camera || !this.renderer) return;
    
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  /**
   * Boucle d'animation
   */
  private animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    
    if (this.scene && this.camera && this.renderer) {
      // Mise à jour des animations
      this.updateAnimations();
      
      // Rendu
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Met à jour les animations
   */
  private updateAnimations(): void {
    // Implémentez ici les mises à jour d'animation
  }

  /**
   * Crée un nouveau graphique temporel
   */
  createTimeSeriesGraph(
    id: string,
    type: GraphType,
    title: string,
    series: Array<{ name: string; data: TimeSeriesPoint[]; color?: string }>,
    config?: Partial<GraphConfig>
  ): void {
    const defaultConfig: GraphConfig = {
      id,
      type,
      title,
      xLabel: 'Temps',
      yLabel: this.getYLabelForType(type),
      color: '#3498db',
      lineWidth: 2,
      showLegend: true,
      showGrid: true,
      animationDuration: 1000,
      ...config
    };

    this.graphs.set(id, {
      config: defaultConfig,
      series: series.map(s => ({
        name: s.name,
        data: s.data,
        color: s.color || this.getDefaultColorForType(type)
      }))
    });
  }

  /**
   * Génère une carte thématique
   */
  createThematicMap(
    id: string,
    title: string,
    points: Array<{ lat: number; lon: number; value: number; timestamp: number; metadata?: any }>,
    config?: Partial<ThematicMapConfig>
  ): void {
    const defaultConfig: ThematicMapConfig = {
      id,
      title,
      colorScale: 'viridis',
      opacity: 0.8,
      pointRadius: 5,
      showLegend: true,
      ...config
    };

    // Appliquer l'échelle de couleurs
    const coloredPoints = points.map(point => ({
      ...point,
      id: `point-${point.lat}-${point.lon}-${point.timestamp}`,
      color: this.calculateColor(point.value, defaultConfig)
    }));

    this.thematicMaps.set(id, coloredPoints);
    this.mapConfigs.set(id, defaultConfig);
  }

  /**
   * Exporte un graphique dans le format spécifié
   */
  exportGraph(graphId: string, format: ExportFormat): string | null {
    const graph = this.graphs.get(graphId);
    if (!graph) return null;

    switch (format) {
      case 'PNG':
      case 'SVG':
        return this.exportAsImage(graphId, format.toLowerCase() as 'png' | 'svg');
      case 'CSV':
        return this.exportAsCSV(graph);
      case 'GEOJSON':
        return this.exportAsGeoJSON(graph);
      default:
        throw new Error(`Format d'export non pris en charge: ${format}`);
    }
  }

  /**
   * Exporte une carte thématique
   */
  exportThematicMap(mapId: string, format: 'GEOJSON' | 'CSV' | 'KML'): string | null {
    const points = this.thematicMaps.get(mapId);
    const config = this.mapConfigs.get(mapId);
    
    if (!points || !config) return null;

    switch (format) {
      case 'GEOJSON':
        return this.exportMapAsGeoJSON(points, config);
      case 'CSV':
        return this.exportMapAsCSV(points);
      case 'KML':
        return this.exportMapAsKML(points, config);
      default:
        throw new Error(`Format d'export non pris en charge pour les cartes: ${format}`);
    }
  }

  /**
   * Calcule les statistiques pour un ensemble de points
   */
  calculateStatistics(points: ThematicPoint[]) {
    if (points.length === 0) return null;

    const values = points.map(p => p.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 
      : sorted[Math.floor(sorted.length / 2)];

    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      mean,
      median,
      stdDev: Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length)
    };
  }

  /**
   * Nettoie les ressources
   */
  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.graphs.clear();
    this.thematicMaps.clear();
    this.mapConfigs.clear();
  }

  // Méthodes d'aide privées
  
  private getYLabelForType(type: GraphType): string {
    const labels = {
      residuals: 'Résidus (m)',
      dop: 'DOP',
      convergence: 'Temps de convergence (s)',
      snr: 'Rapport signal/bruit (dB)',
      elevation: 'Angle d\'élévation (°)'
    };
    return labels[type] || 'Valeur';
  }

  private getDefaultColorForType(type: GraphType): string {
    const colors = {
      residuals: '#e74c3c',
      dop: '#9b59b6',
      convergence: '#2ecc71',
      snr: '#3498db',
      elevation: '#f39c12'
    };
    return colors[type] || '#3498db';
  }

  private calculateColor(value: number, config: ThematicMapConfig): string {
    // Implémentation simplifiée - à améliorer avec une vraie échelle de couleurs
    if (config.colorScale === 'custom' && config.customColors?.length) {
      const index = Math.min(
        Math.floor((value / 100) * config.customColors.length),
        config.customColors.length - 1
      );
      return config.customColors[index];
    }
    
    // Implémentation par défaut avec une échelle de chaleur
    const hue = (1 - Math.min(1, value / 10)) * 120; // 0 (rouge) à 120 (vert)
    return `hsl(${hue}, 100%, 50%)`;
  }

  private exportAsImage(graphId: string, format: 'png' | 'svg'): string {
    // Implémentation factice - à remplacer par un vrai rendu
    return `data:image/${format};base64,...`;
  }

  private exportAsCSV(graph: GraphData): string {
    const headers = ['timestamp', ...graph.series.map(s => s.name)];
    const rows: string[][] = [];
    
    // Récupérer tous les timestamps uniques
    const allTimestamps = new Set<number>();
    graph.series.forEach(series => {
      series.data.forEach(point => allTimestamps.add(point.timestamp));
    });
    
    // Trier les timestamps
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    
    // Construire les lignes
    for (const timestamp of sortedTimestamps) {
      const row: (string | number)[] = [new Date(timestamp).toISOString()];
      
      for (const series of graph.series) {
        const point = series.data.find(p => p.timestamp === timestamp);
        row.push(point ? point.value : '');
      }
      
      rows.push(row.map(String));
    }
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  private exportAsGeoJSON(graph: GraphData): string {
    // Implémentation simplifiée - à adapter selon les besoins
    const features = graph.series.flatMap((series, seriesIndex) => 
      series.data.map(point => ({
        type: 'Feature',
        properties: {
          series: series.name,
          value: point.value,
          timestamp: new Date(point.timestamp).toISOString(),
          ...point.meta
        },
        geometry: {
          type: 'Point',
          coordinates: [0, 0] // À remplacer par des coordonnées réelles si disponibles
        }
      }))
    );
    
    return JSON.stringify({
      type: 'FeatureCollection',
      features
    }, null, 2);
  }

  private exportMapAsGeoJSON(points: ThematicPoint[], config: ThematicMapConfig): string {
    const features = points.map(point => ({
      type: 'Feature',
      properties: {
        id: point.id,
        value: point.value,
        timestamp: new Date(point.timestamp).toISOString(),
        color: point.color,
        ...point.metadata
      },
      geometry: {
        type: 'Point',
        coordinates: [point.lon, point.lat]
      }
    }));
    
    return JSON.stringify({
      type: 'FeatureCollection',
      features
    }, null, 2);
  }

  private exportMapAsCSV(points: ThematicPoint[]): string {
    if (points.length === 0) return '';
    
    // Extraire les clés de métadonnées communes
    const metaKeys = new Set<string>();
    points.forEach(point => {
      if (point.metadata) {
        Object.keys(point.metadata).forEach(key => metaKeys.add(key));
      }
    });
    
    const headers = ['id', 'lat', 'lon', 'value', 'color', 'timestamp', ...Array.from(metaKeys)];
    const rows = points.map(point => {
      const row = [
        point.id,
        point.lat,
        point.lon,
        point.value,
        point.color,
        new Date(point.timestamp).toISOString()
      ];
      
      // Ajouter les métadonnées dans l'ordre des clés
      metaKeys.forEach(key => {
        row.push(point.metadata?.[key] ?? '');
      });
      
      return row.map(String);
    });
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  private exportMapAsKML(points: ThematicPoint[], config: ThematicMapConfig): string {
    // Implémentation simplifiée - à adapter selon les besoins
    const placemarks = points.map(point => `
      <Placemark>
        <name>${point.id}</name>
        <description>
          <![CDATA[
            <p>Valeur: ${point.value}</p>
            <p>Date: ${new Date(point.timestamp).toISOString()}</p>
            ${point.metadata ? Object.entries(point.metadata)
              .map(([key, value]) => `<p>${key}: ${value}</p>`)
              .join('') : ''}
          ]]>
        </description>
        <styleUrl>#point-${point.color.replace('#', '')}</styleUrl>
        <Point>
          <coordinates>${point.lon},${point.lat},0</coordinates>
        </Point>
      </Placemark>
    `).join('');
    
    return `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <name>${config.title}</name>
          ${this.generateKMLStyles(points)}
          ${placemarks}
        </Document>
      </kml>`;
  }

  private generateKMLStyles(points: ThematicPoint[]): string {
    const uniqueColors = [...new Set(points.map(p => p.color))];
    
    return uniqueColors.map(color => `
      <Style id="point-${color.replace('#', '')}">
        <IconStyle>
          <color>${this.rgbToKML(color)}</color>
          <scale>1.0</scale>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href>
          </Icon>
        </IconStyle>
      </Style>
    `).join('');
  }

  private rgbToKML(hexColor: string): string {
    // Convertit #RRGGBB en AABBGGRR (KML utilise l'ordre ARGB en hexadécimal)
    const r = hexColor.slice(1, 3);
    const g = hexColor.slice(3, 5);
    const b = hexColor.slice(5, 7);
    return `ff${b}${g}${r}`; // Ajoute FF pour une opacité à 100%
  }
}
