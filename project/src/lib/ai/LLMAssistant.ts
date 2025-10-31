import { fileSyncManager } from '../sync/FileSyncManager';
import { missionSync } from '../sync/MissionSync';
import { fusionAuditLog } from '../security/FusionAuditLog';

type GNSSFormat = 'GPX' | 'NMEA' | 'RINEX' | 'GeoJSON';
type FixQuality = 'RTK' | 'Float' | 'Single' | 'PPK' | 'DGPS' | 'PPS' | 'Unknown';

export interface PositionFix {
  lat: number;
  lon: number;
  alt?: number;
  timestamp: number;
  hdop?: number;  // Horizontal Dilution of Precision
  vdop?: number;   // Vertical Dilution of Precision
  pdop?: number;   // Position Dilution of Precision
  quality?: FixQuality;
  source: GNSSFormat;
  metadata?: {
    satCount?: number;
    fixType?: string;
    speed?: number;     // in m/s
    heading?: number;   // in degrees
    [key: string]: any;
  };
}

export interface PositionReport {
  missionId?: string;
  deviceId?: string;
  startTime: number;
  endTime: number;
  fixes: PositionFix[];
  summary: {
    duration: number;      // in milliseconds
    distance: number;      // in meters
    avgSpeed: number;      // in m/s
    maxSpeed: number;      // in m/s
    fixCount: number;
    fixRate: number;       // fixes per second
    avgHdop?: number;
    avgVdop?: number;
    avgPdop?: number;
    dominantMode?: FixQuality;
    coordinateSystem?: string;
    accuracyEstimate?: number;  // in meters
  };
  metadata?: {
    deviceInfo?: {
      model?: string;
      firmware?: string;
      serialNumber?: string;
    };
    processingInfo?: {
      software?: string;
      version?: string;
      processingTime?: number;
    };
    [key: string]: any;
  };
}

class LLMAssistant {
  private static instance: LLMAssistant;
  
  private constructor() {
    // Initialisation privée pour le singleton
  }

  public static getInstance(): LLMAssistant {
    if (!LLMAssistant.instance) {
      LLMAssistant.instance = new LLMAssistant();
    }
    return LLMAssistant.instance;
  }

  /**
   * Parse un fichier de traces GNSS dans le format spécifié
   */
  public async parseGNSSFile(content: string, format: GNSSFormat, options: {
    missionId?: string;
    deviceId?: string;
    coordinateSystem?: string;
  } = {}): Promise<PositionReport> {
    let fixes: PositionFix[] = [];
    
    try {
      switch (format.toUpperCase() as GNSSFormat) {
        case 'GPX':
          fixes = this.parseGPX(content);
          break;
        case 'NMEA':
          fixes = this.parseNMEA(content);
          break;
        case 'RINEX':
          fixes = await this.parseRINEX(content);
          break;
        case 'GEOJSON':
          fixes = this.parseGeoJSON(content);
          break;
        default:
          throw new Error(`Format GNSS non supporté: ${format}`);
      }

      // Journalisation de l'import
      await fusionAuditLog.log({
        action: 'gnss_import',
        entityType: 'mission',
        entityId: options.missionId,
        details: {
          format,
          fixCount: fixes.length,
          coordinateSystem: options.coordinateSystem
        }
      });

      return this.generatePositionReport(fixes, {
        missionId: options.missionId,
        deviceId: options.deviceId,
        coordinateSystem: options.coordinateSystem
      });
    } catch (error) {
      console.error('Erreur lors du parsing du fichier GNSS:', error);
      throw new Error(`Échec du parsing du fichier GNSS (${format}): ${error.message}`);
    }
  }

  private parseGPX(content: string): PositionFix[] {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(content, 'application/xml');
      const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
      
      return trkpts.map((pt, index) => {
        const lat = parseFloat(pt.getAttribute('lat') || '0');
        const lon = parseFloat(pt.getAttribute('lon') || '0');
        const ele = pt.getElementsByTagName('ele')[0]?.textContent;
        const time = pt.getElementsByTagName('time')[0]?.textContent;
        const hdop = pt.getElementsByTagName('hdop')[0]?.textContent;
        const sat = pt.getElementsByTagName('sat')[0]?.textContent;
        
        return {
          lat,
          lon,
          alt: ele ? parseFloat(ele) : undefined,
          timestamp: time ? new Date(time).getTime() : Date.now() + index,
          hdop: hdop ? parseFloat(hdop) : undefined,
          source: 'GPX',
          metadata: {
            satCount: sat ? parseInt(sat, 10) : undefined
          }
        };
      });
    } catch (error) {
      throw new Error(`Erreur de parsing GPX: ${error.message}`);
    }
  }

  private parseNMEA(content: string): PositionFix[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    const fixes: PositionFix[] = [];
    let lastValidTime = Date.now();

    for (const line of lines) {
      try {
        if (!line.startsWith('$')) continue;
        
        const parts = line.split(',');
        const sentenceType = parts[0];
        
        // Gestion des différentes phrases NMEA
        if (sentenceType === '$GPGGA') {
          // Exemple: $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
          if (parts.length < 10) continue;
          
          const timeStr = parts[1];
          const latStr = parts[2];
          const latDir = parts[3];
          const lonStr = parts[4];
          const lonDir = parts[5];
          const fixQuality = parseInt(parts[6], 10);
          const satCount = parseInt(parts[7], 10);
          const hdop = parseFloat(parts[8]);
          const alt = parseFloat(parts[9]);
          
          // Conversion des coordonnées NMEA en degrés décimaux
          const lat = this.convertNMEAToDecimal(parseFloat(latStr), latDir);
          const lon = this.convertNMEAToDecimal(parseFloat(lonStr), lonDir);
          
          // Détermination de la qualité de la position
          let quality: FixQuality = 'Unknown';
          switch (fixQuality) {
            case 1: quality = 'Single'; break;
            case 2: quality = 'DGPS'; break;
            case 4: quality = 'RTK'; break;
            case 5: quality = 'Float';
          }
          
          // Création d'un timestamp (approximatif si l'heure seule est fournie)
          const timestamp = this.parseNMEATime(timeStr, lastValidTime);
          lastValidTime = timestamp;
          
          fixes.push({
            lat,
            lon,
            alt,
            timestamp,
            hdop,
            quality,
            source: 'NMEA',
            metadata: {
              satCount,
              fixType: this.getNMEAFixType(fixQuality)
            }
          });
        }
        // Ajouter la gestion d'autres phrases NMEA (GPRMC, GPGSA, etc.) ici
      } catch (error) {
        console.warn('Erreur de parsing NMEA, ligne ignorée:', line, error);
      }
    }
    
    return fixes;
  }

  private async parseRINEX(content: string): Promise<PositionFix[]> {
    // Placeholder - implémentation basique pour RINEX
    // Une implémentation complète nécessiterait une bibliothèque spécialisée
    console.warn('Le support RINEX est limité dans cette version');
    return [];
  }

  private parseGeoJSON(content: string): PositionFix[] {
    try {
      const geojson = JSON.parse(content);
      const features = geojson.features || [geojson];
      const now = Date.now();
      
      return features.flatMap((feature: any) => {
        if (!feature.geometry || !feature.geometry.coordinates) return [];
        
        const { coordinates } = feature.geometry;
        const properties = feature.properties || {};
        
        // Support pour différents types de géométries GeoJSON
        if (feature.geometry.type === 'Point') {
          return [{
            lon: coordinates[0],
            lat: coordinates[1],
            alt: coordinates[2],
            timestamp: properties.timestamp || now,
            source: 'GeoJSON',
            metadata: {
              ...properties,
              geometryType: 'Point'
            }
          }];
        } else if (feature.geometry.type === 'LineString') {
          return coordinates.map((coord: number[], index: number) => ({
            lon: coord[0],
            lat: coord[1],
            alt: coord[2],
            timestamp: properties.timestamp ? 
              properties.timestamp + (index * 1000) : // Si un timestamp de base est fourni
              now + (index * 1000),
            source: 'GeoJSON',
            metadata: {
              ...properties,
              pointIndex: index,
              geometryType: 'LineString'
            }
          }));
        }
        
        return [];
      });
    } catch (error) {
      throw new Error(`Erreur de parsing GeoJSON: ${error.message}`);
    }
  }

  public generatePositionReport(
    fixes: PositionFix[], 
    options: {
      missionId?: string;
      deviceId?: string;
      coordinateSystem?: string;
    } = {}
  ): PositionReport {
    if (fixes.length === 0) {
      throw new Error('Impossible de générer un rapport sans points de position');
    }

    // Tri par timestamp si nécessaire
    const sortedFixes = [...fixes].sort((a, b) => a.timestamp - b.timestamp);
    
    const startTime = sortedFixes[0].timestamp;
    const endTime = sortedFixes[sortedFixes.length - 1].timestamp;
    const duration = endTime - startTime;
    
    // Calcul des statistiques de base
    let totalDistance = 0;
    let totalSpeed = 0;
    let maxSpeed = 0;
    let totalHdop = 0;
    let totalVdop = 0;
    let totalPdop = 0;
    
    // Calcul de la distance totale et de la vitesse
    for (let i = 1; i < sortedFixes.length; i++) {
      const prev = sortedFixes[i - 1];
      const curr = sortedFixes[i];
      
      // Distance en mètres (formule de Haversine)
      const distance = this.calculateDistance(
        prev.lat, prev.lon, 
        curr.lat, curr.lon,
        prev.alt,
        curr.alt
      );
      totalDistance += distance;
      
      // Vitesse en m/s
      const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // en secondes
      if (timeDiff > 0) {
        const speed = distance / timeDiff;
        totalSpeed += speed;
        maxSpeed = Math.max(maxSpeed, speed);
      }
      
      // Sommes pour les moyennes
      if (curr.hdop) totalHdop += curr.hdop;
      if (curr.vdop) totalVdop += curr.vdop;
      if (curr.pdop) totalPdop += curr.pdop;
    }
    
    const fixCount = sortedFixes.length;
    const avgSpeed = fixCount > 1 ? totalSpeed / (fixCount - 1) : 0;
    
    return {
      missionId: options.missionId,
      deviceId: options.deviceId,
      startTime,
      endTime,
      fixes: sortedFixes,
      summary: {
        duration,
        distance: totalDistance,
        avgSpeed,
        maxSpeed,
        fixCount,
        fixRate: duration > 0 ? (fixCount / (duration / 1000)) : 0,
        avgHdop: fixCount > 0 ? totalHdop / fixCount : undefined,
        avgVdop: fixCount > 0 ? totalVdop / fixCount : undefined,
        avgPdop: fixCount > 0 ? totalPdop / fixCount : undefined,
        dominantMode: this.getDominantFixMode(sortedFixes),
        coordinateSystem: options.coordinateSystem || 'WGS84',
        accuracyEstimate: this.estimateAccuracy(sortedFixes)
      },
      metadata: {
        processingInfo: {
          software: 'CadastreIA/LLMAssistant',
          version: '1.0.0',
          processingTime: Date.now()
        }
      }
    };
  }

  // Méthodes utilitaires
  
  private convertNMEAToDecimal(coord: number, direction: string): number {
    // Convertit les coordonnées NMEA (DDMM.MMMM) en degrés décimaux
    const degrees = Math.floor(coord / 100);
    const minutes = coord % 100;
    let decimal = degrees + (minutes / 60);
    
    // Ajuste le signe en fonction de la direction (N/S, E/W)
    if (['S', 'W'].includes(direction.toUpperCase())) {
      decimal = -decimal;
    }
    
    return parseFloat(decimal.toFixed(8));
  }
  
  private parseNMEATime(timeStr: string, referenceDate: number): number {
    // Convertit une chaîne de temps NMEA (HHMMSS.SSS) en timestamp
    if (!timeStr || timeStr.length < 6) return referenceDate;
    
    const date = new Date(referenceDate);
    const hours = parseInt(timeStr.substring(0, 2), 10);
    const minutes = parseInt(timeStr.substring(2, 4), 10);
    const seconds = parseFloat(timeStr.substring(4));
    
    date.setHours(hours, minutes, Math.floor(seconds), (seconds % 1) * 1000);
    return date.getTime();
  }
  
  private getNMEAFixType(quality: number): string {
    const types = [
      'Invalid', 'GPS fix', 'DGPS fix', 'PPS fix', 
      'RTK Fixed', 'RTK Float', 'Estimated', 'Manual', 'Simulation'
    ];
    return types[quality] || `Unknown (${quality})`;
  }
  
  private calculateDistance(
    lat1: number, lon1: number, 
    lat2: number, lon2: number, 
    alt1?: number, alt2?: number
  ): number {
    // Rayon de la Terre en mètres
    const R = 6371e3;
    
    // Conversion des degrés en radians
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    // Formule de Haversine
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    // Distance horizontale en mètres
    const horizontalDistance = R * c;
    
    // Si les altitudes sont fournies, calculer la distance 3D
    if (alt1 !== undefined && alt2 !== undefined) {
      const verticalDistance = Math.abs(alt2 - alt1);
      return Math.sqrt(Math.pow(horizontalDistance, 2) + Math.pow(verticalDistance, 2));
    }
    
    return horizontalDistance;
  }
  
  private getDominantFixMode(fixes: PositionFix[]): FixQuality {
    const counts = fixes.reduce<Record<FixQuality, number>>((acc, fix) => {
      const mode = fix.quality || 'Unknown';
      acc[mode] = (acc[mode] || 0) + 1;
      return acc;
    }, {} as Record<FixQuality, number>);
    
    // Trie par nombre d'occurrences décroissant
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1]);
    
    return (sorted[0]?.[0] as FixQuality) || 'Unknown';
  }
  
  private estimateAccuracy(fixes: PositionFix[]): number | undefined {
    if (fixes.length === 0) return undefined;
    
    // Estimation basée sur le HDOP moyen et le mode de positionnement
    const avgHdop = fixes.reduce((sum, fix) => sum + (fix.hdop || 5), 0) / fixes.length;
    const dominantMode = this.getDominantFixMode(fixes);
    
    // Facteurs d'échelle empiriques (en mètres)
    const modeFactors: Record<FixQuality, number> = {
      'RTK': 0.01,
      'PPK': 0.02,
      'DGPS': 0.5,
      'Float': 0.5,
      'Single': 2.5,
      'PPS': 2.0,
      'Unknown': 5.0
    };
    
    return avgHdop * (modeFactors[dominantMode] || 5.0);
  }
  
  // Méthodes d'intégration avec d'autres composants
  
  public async importGNSSFromFile(file: File): Promise<PositionReport> {
    const content = await file.text();
    const extension = file.name.split('.').pop()?.toUpperCase() as GNSSFormat;
    
    // Association automatique avec la mission courante si disponible
    const currentMission = missionSync.getCurrentMission();
    
    return this.parseGNSSFile(content, extension, {
      missionId: currentMission?.id,
      deviceId: 'device-1' // À remplacer par l'ID du dispositif réel
    });
  }
  
  public async exportToGeoJSON(fixes: PositionFix[]): Promise<string> {
    const features = fixes.map((fix, index) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [fix.lon, fix.lat, fix.alt].filter(v => v !== undefined)
      },
      properties: {
        index,
        timestamp: fix.timestamp,
        quality: fix.quality,
        hdop: fix.hdop,
        vdop: fix.vdop,
        pdop: fix.pdop,
        ...fix.metadata
      }
    }));
    
    return JSON.stringify({
      type: 'FeatureCollection',
      features,
      properties: {
        generated: new Date().toISOString(),
        count: features.length,
        source: 'CadastreIA/LLMAssistant'
      }
    }, null, 2);
  }
}

export const llmAssistant = LLMAssistant.getInstance();
export type { GNSSFormat, FixQuality };
