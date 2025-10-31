import { z } from 'zod';
import { fusionAuditLog } from '../security/FusionAuditLog';
import { fileSyncManager } from '../sync/FileSyncManager';
import { missionSync } from '../sync/MissionSync';
import { llmAssistant } from '../ai/LLMAssistant';

// Schémas de validation avec Zod
const RinexHeaderSchema = z.object({
  version: z.string(),
  fileType: z.enum(['OBSERVATION', 'NAVIGATION', 'METEOROLOGICAL', 'GLONASS', 'GEOS']),
  gnssType: z.enum(['GPS', 'GLONASS', 'GALILEO', 'BEIDOU', 'QZSS', 'IRNSS', 'SBAS', 'MIXED']).optional(),
  markerName: z.string().optional(),
  markerNumber: z.string().optional(),
  markerType: z.string().optional(),
  observer: z.string().optional(),
  agency: z.string().optional(),
  receiverInfo: z.object({
    number: z.string().optional(),
    type: z.string().optional(),
    version: z.string().optional(),
  }).optional(),
  antennaInfo: z.object({
    number: z.string().optional(),
    type: z.string().optional(),
    deltaH: z.number().optional(),
    deltaE: z.number().optional(),
    deltaN: z.number().optional(),
  }).optional(),
  positionApprox: z.tuple([z.number(), z.number(), z.number()]).optional(),
  antennaDelta: z.tuple([z.number(), z.number(), z.number()]).optional(),
  wavelengthFactors: z.tuple([z.number(), z.number()]).array().length(2).optional(),
  observationTypes: z.record(z.string(), z.string().array()).optional(),
  interval: z.number().optional(),
  firstObs: z.object({
    year: z.number(),
    month: z.number(),
    day: z.number(),
    hour: z.number(),
    minute: z.number(),
    second: z.number(),
    timeSystem: z.string(),
  }).optional(),
  lastObs: z.object({
    year: z.number(),
    month: z.number(),
    day: z.number(),
    hour: z.number(),
    minute: z.number(),
    second: z.number(),
    timeSystem: z.string(),
  }).optional(),
  receiverClockOffset: z.boolean().default(false),
  leapSeconds: z.number().optional(),
  comment: z.string().optional(),
});

const RinexObservationSchema = z.object({
  timestamp: z.number(),
  epochFlag: z.number(),
  receiverClockOffset: z.number().optional(),
  satellites: z.array(z.string()),
  observations: z.record(
    z.string(), // Satellite ID (e.g., 'G01')
    z.record(
      z.string(), // Observation type (e.g., 'L1', 'C1', 'D1', 'S1')
      z.object({
        value: z.number(),
        lli: z.number().optional(), // Loss of lock indicator
        signalStrength: z.number().optional(), // Signal strength (0-9)
      })
    )
  ),
});

type RinexHeader = z.infer<typeof RinexHeaderSchema>;
type RinexObservation = z.infer<typeof RinexObservationSchema>;

export class RinexParser {
  private static instance: RinexParser;
  
  private constructor() {}
  
  public static getInstance(): RinexParser {
    if (!RinexParser.instance) {
      RinexParser.instance = new RinexParser();
    }
    return RinexParser.instance;
  }

  /**
   * Parse un fichier RINEX et retourne les données structurées
   */
  public async parseRinexFile(content: string, options: {
    missionId?: string;
    filePath?: string;
  } = {}): Promise<{
    header: RinexHeader;
    observations: RinexObservation[];
    metadata: {
      fileSize: number;
      duration?: number;
      satelliteSystems: Set<string>;
      observationTypes: Set<string>;
      startTime?: Date;
      endTime?: Date;
    };
  }> {
    try {
      const lines = content.split(/\r?\n/);
      const headerResult = this.parseHeader(lines);
      
      // Valider l'en-tête avec le schéma
      const header = RinexHeaderSchema.parse(headerResult);
      
      // Parser les observations
      const { observations, metadata } = await this.parseObservations(
        lines.slice(headerResult.headerEndLine + 1),
        header
      );
      
      // Mettre à jour les métadonnées
      const fileMetadata = {
        fileSize: new Blob([content]).size,
        duration: metadata.duration,
        satelliteSystems: new Set(Array.from(metadata.satelliteSystems).sort()),
        observationTypes: new Set(Array.from(metadata.observationTypes).sort()),
        startTime: metadata.startTime,
        endTime: metadata.endTime,
      };
      
      // Journaliser l'import
      await this.logRinexImport({
        missionId: options.missionId,
        filePath: options.filePath,
        header,
        metadata: fileMetadata,
      });
      
      return {
        header,
        observations,
        metadata: fileMetadata,
      };
      
    } catch (error) {
      console.error('Erreur lors du parsing RINEX:', error);
      throw new Error(`Échec du parsing RINEX: ${error.message}`);
    }
  }
  
  /**
   * Parse l'en-tête d'un fichier RINEX
   */
  private parseHeader(lines: string[]): RinexHeader & { headerEndLine: number } {
    const header: Partial<RinexHeader> = {};
    let headerEndLine = 0;
    
    for (let i = 0; i < Math.min(100, lines.length); i++) {
      const line = lines[i];
      if (!line) continue;
      
      // Vérifier la fin de l'en-tête
      if (line.includes('END OF HEADER')) {
        headerEndLine = i;
        break;
      }
      
      // Extraire les informations de l'en-tête
      if (line.includes('RINEX VERSION / TYPE')) {
        header.version = line.slice(0, 9).trim();
        const fileType = line.slice(20, 21);
        header.fileType = this.mapFileType(fileType);
        header.gnssType = this.mapGnssType(line.slice(40, 60).trim());
      } 
      else if (line.includes('PGM / RUN BY / DATE')) {
        header.observer = line.slice(0, 20).trim();
        header.agency = line.slice(20, 40).trim();
      }
      else if (line.includes('MARKER NAME')) {
        header.markerName = line.slice(0, 60).trim();
      }
      else if (line.includes('MARKER NUMBER')) {
        header.markerNumber = line.slice(0, 60).trim();
      }
      else if (line.includes('MARKER TYPE')) {
        header.markerType = line.slice(0, 60).trim();
      }
      else if (line.includes('OBSERVER / AGENCY')) {
        header.observer = line.slice(0, 20).trim();
        header.agency = line.slice(20, 60).trim();
      }
      else if (line.includes('REC # / TYPE / VERS')) {
        header.receiverInfo = {
          number: line.slice(0, 20).trim(),
          type: line.slice(20, 40).trim(),
          version: line.slice(40, 60).trim(),
        };
      }
      else if (line.includes('ANT # / TYPE')) {
        header.antennaInfo = {
          number: line.slice(0, 20).trim(),
          type: line.slice(20, 40).trim(),
        };
      }
      else if (line.includes('ANTENNA: DELTA H/E/N')) {
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 4) {
          header.antennaDelta = [
            parseFloat(parts[1]), // H
            parseFloat(parts[2]), // E
            parseFloat(parts[3])  // N
          ];
        }
      }
      else if (line.includes('APPROX POSITION XYZ')) {
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 4) {
          header.positionApprox = [
            parseFloat(parts[0]), // X
            parseFloat(parts[1]), // Y
            parseFloat(parts[2])  // Z
          ];
        }
      }
      else if (line.includes('WAVELENGTH FACT L1/2')) {
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 3) {
          header.wavelengthFactors = [
            [parseInt(parts[0]), parseInt(parts[1])],
            [parseInt(parts[2]), parseInt(parts[3] || '0')]
          ];
        }
      }
      else if (line.includes('# / TYPES OF OBSERV')) {
        const count = parseInt(line.slice(0, 6).trim()) || 0;
        const types: string[] = [];
        
        // Lire les types d'observation sur cette ligne et les suivantes si nécessaire
        let lineIndex = 0;
        let remainingTypes = count;
        
        while (remainingTypes > 0 && i + lineIndex < lines.length) {
          const currentLine = lines[i + lineIndex];
          const typesInLine = Math.min(9, remainingTypes);
          
          for (let j = 0; j < typesInLine; j++) {
            const start = 10 + j * 6;
            const type = currentLine.slice(start, start + 2).trim();
            if (type) types.push(type);
          }
          
          remainingTypes -= typesInLine;
          lineIndex++;
        }
        
        header.observationTypes = { [header.gnssType || 'GPS']: types };
        i += lineIndex - 1; // Ajuster l'index principal
      }
      else if (line.includes('INTERVAL')) {
        header.interval = parseFloat(line.slice(0, 10).trim());
      }
      else if (line.includes('TIME OF FIRST OBS')) {
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 7) {
          header.firstObs = {
            year: parseInt(parts[0]),
            month: parseInt(parts[1]),
            day: parseInt(parts[2]),
            hour: parseInt(parts[3]),
            minute: parseInt(parts[4]),
            second: parseFloat(parts[5]),
            timeSystem: parts[6],
          };
        }
      }
      else if (line.includes('TIME OF LAST OBS')) {
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 7) {
          header.lastObs = {
            year: parseInt(parts[0]),
            month: parseInt(parts[1]),
            day: parseInt(parts[2]),
            hour: parseInt(parts[3]),
            minute: parseInt(parts[4]),
            second: parseFloat(parts[5]),
            timeSystem: parts[6],
          };
        }
      }
      else if (line.includes('LEAP SECONDS')) {
        header.leapSeconds = parseInt(line.slice(0, 6).trim());
      }
      else if (line.includes('COMMENT')) {
        const comment = line.slice(0, 60).trim();
        header.comment = header.comment ? `${header.comment}\n${comment}` : comment;
      }
    }
    
    if (!headerEndLine) {
      throw new Error('En-tête RINEX invalide: marqueur "END OF HEADER" non trouvé');
    }
    
    return { ...header, headerEndLine } as RinexHeader & { headerEndLine: number };
  }
  
  /**
   * Parse les observations RINEX
   */
  private async parseObservations(
    lines: string[], 
    header: RinexHeader
  ): Promise<{
    observations: RinexObservation[];
    metadata: {
      satelliteSystems: Set<string>;
      observationTypes: Set<string>;
      startTime?: Date;
      endTime?: Date;
      duration?: number;
    };
  }> {
    const observations: RinexObservation[] = [];
    const metadata = {
      satelliteSystems: new Set<string>(),
      observationTypes: new Set<string>(),
      startTime: undefined as Date | undefined,
      endTime: undefined as Date | undefined,
      duration: undefined as number | undefined,
    };
    
    let currentEpoch: {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second: number;
      epochFlag: number;
      satellites: string[];
      receiverClockOffset?: number;
    } | null = null;
    
    let currentObservations: Record<string, Record<string, { value: number; lli?: number; signalStrength?: number }>> = {};
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      // Ligne d'en-tête d'époque
      if (line.startsWith('>')) {
        // Enregistrer les observations précédentes
        if (currentEpoch && Object.keys(currentObservations).length > 0) {
          const timestamp = this.convertToTimestamp(
            currentEpoch.year, 
            currentEpoch.month, 
            currentEpoch.day,
            currentEpoch.hour,
            currentEpoch.minute,
            currentEpoch.second
          );
          
          // Mettre à jour les métadonnées de temps
          const currentDate = new Date(timestamp);
          if (!metadata.startTime || currentDate < metadata.startTime) {
            metadata.startTime = currentDate;
          }
          if (!metadata.endTime || currentDate > metadata.endTime) {
            metadata.endTime = currentDate;
          }
          
          observations.push({
            timestamp,
            epochFlag: currentEpoch.epochFlag,
            receiverClockOffset: currentEpoch.receiverClockOffset,
            satellites: [...currentEpoch.satellites],
            observations: { ...currentObservations },
          });
          
          currentObservations = {};
        }
        
        // Parser la nouvelle époque
        const epochData = this.parseEpochHeader(line);
        currentEpoch = {
          ...epochData,
          satellites: [],
        };
        
        // Si le drapeau d'époque est différent de 0, c'est un événement spécial
        if (epochData.epochFlag !== 0) {
          // Gérer les événements spéciaux (cycle slip, etc.)
          // Pour l'instant, on les ignore
          i += epochData.satelliteCount || 0;
          currentEpoch = null;
          continue;
        }
        
        // Lire les satellites pour cette époque
        const satLines = Math.ceil((epochData.satelliteCount || 0) / 12);
        const sats: string[] = [];
        
        for (let j = 0; j < satLines; j++) {
          const satLine = lines[++i] || '';
          for (let k = 0; k < satLine.length; k += 3) {
            const satId = satLine.slice(k, k + 3).trim();
            if (satId) {
              sats.push(satId);
              metadata.satelliteSystems.add(satId[0]); // G, R, E, C, J, I, S
            }
          }
        }
        
        if (currentEpoch) {
          currentEpoch.satellites = sats;
        }
      } 
      // Ligne d'observation
      else if (currentEpoch) {
        // Le format des observations dépend de la version RINEX et des types d'observation
        // Pour simplifier, on suppose un format RINEX 3.x avec des observations sur plusieurs lignes
        const satId = line.slice(0, 3).trim();
        if (!satId || !currentEpoch.satellites.includes(satId)) continue;
        
        const obsTypes = header.observationTypes?.[satId[0]] || [];
        if (!obsTypes.length) continue;
        
        currentObservations[satId] = currentObservations[satId] || {};
        
        // Parser les observations pour ce satellite
        let valueIndex = 3;
        for (const obsType of obsTypes) {
          if (valueIndex + 13 > line.length) break;
          
          const valueStr = line.slice(valueIndex, valueIndex + 14).trim();
          if (!valueStr) {
            valueIndex += 16; // Passe à la prochaine observation
            continue;
          }
          
          const value = parseFloat(valueStr);
          const lli = line[valueIndex + 14] ? parseInt(line[valueIndex + 14]) : undefined;
          const signalStrength = line[valueIndex + 15] ? parseInt(line[valueIndex + 15]) : undefined;
          
          if (!isNaN(value)) {
            currentObservations[satId][obsType] = { value, lli, signalStrength };
            metadata.observationTypes.add(obsType);
          }
          
          valueIndex += 16; // Passe à la prochaine observation
        }
      }
    }
    
    // Calculer la durée totale
    if (metadata.startTime && metadata.endTime) {
      metadata.duration = metadata.endTime.getTime() - metadata.startTime.getTime();
    }
    
    return { observations, metadata };
  }
  
  /**
   * Convertit une date RINEX en timestamp
   */
  private convertToTimestamp(
    year: number, 
    month: number, 
    day: number, 
    hour: number, 
    minute: number, 
    second: number
  ): number {
    // Ajuster l'année à 4 chiffres (RINEX 2 utilise 2 chiffres)
    const fullYear = year < 100 ? (year >= 80 ? 1900 + year : 2000 + year) : year;
    
    // Créer une date en UTC
    const date = new Date(Date.UTC(fullYear, month - 1, day, hour, minute, second));
    
    // Vérifier si la date est valide
    if (isNaN(date.getTime())) {
      throw new Error(`Date RINEX invalide: ${year}-${month}-${day} ${hour}:${minute}:${second}`);
    }
    
    return date.getTime();
  }
  
  /**
   * Parse l'en-tête d'époque RINEX
   */
  private parseEpochHeader(line: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    epochFlag: number;
    satelliteCount: number;
    receiverClockOffset?: number;
  } {
    const year = parseInt(line.slice(1, 5).trim()) || 2000;
    const month = parseInt(line.slice(6, 8).trim()) || 1;
    const day = parseInt(line.slice(9, 11).trim()) || 1;
    const hour = parseInt(line.slice(12, 14).trim()) || 0;
    const minute = parseInt(line.slice(15, 17).trim()) || 0;
    const second = parseFloat(line.slice(17, 29).trim()) || 0;
    const epochFlag = parseInt(line[29] || '0');
    const satelliteCount = parseInt(line[30] + (line[31] || '0').trim()) || 0;
    
    let receiverClockOffset;
    if (line.length > 68) {
      receiverClockOffset = parseFloat(line.slice(68).trim());
      if (isNaN(receiverClockOffset)) receiverClockOffset = undefined;
    }
    
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      epochFlag,
      satelliteCount,
      receiverClockOffset,
    };
  }
  
  /**
   * Convertit le type de fichier RINEX
   */
  private mapFileType(type: string): 'OBSERVATION' | 'NAVIGATION' | 'METEOROLOGICAL' | 'GLONASS' | 'GEOS' {
    switch (type) {
      case 'O': return 'OBSERVATION';
      case 'N': return 'NAVIGATION';
      case 'M': return 'METEOROLOGICAL';
      case 'G': return 'GLONASS';
      case 'H': return 'GEOS';
      default: return 'OBSERVATION';
    }
  }
  
  /**
   * Convertit le type de système GNSS
   */
  private mapGnssType(type: string): RinexHeader['gnssType'] {
    switch (type) {
      case 'GPS': return 'GPS';
      case 'GLO': return 'GLONASS';
      case 'GAL': return 'GALILEO';
      case 'BDS': case 'BDT': return 'BEIDOU';
      case 'QZS': return 'QZSS';
      case 'IRN': return 'IRNSS';
      case 'SBAS': return 'SBAS';
      case 'MIXED': return 'MIXED';
      default: return 'GPS';
    }
  }
  
  /**
   * Journalise l'import d'un fichier RINEX
   */
  private async logRinexImport(params: {
    missionId?: string;
    filePath?: string;
    header: RinexHeader;
    metadata: {
      fileSize: number;
      duration?: number;
      satelliteSystems: Set<string>;
      observationTypes: Set<string>;
      startTime?: Date;
      endTime?: Date;
    };
  }) {
    const { missionId, filePath, header, metadata } = params;
    
    // Journaliser avec FusionAuditLog
    await fusionAuditLog.log({
      action: 'rinex_import',
      entityType: 'mission',
      entityId: missionId,
      details: {
        filePath,
        fileSize: metadata.fileSize,
        version: header.version,
        fileType: header.fileType,
        gnssType: header.gnssType,
        markerName: header.markerName,
        receiverType: header.receiverInfo?.type,
        antennaType: header.antennaInfo?.type,
        startTime: metadata.startTime?.toISOString(),
        endTime: metadata.endTime?.toISOString(),
        duration: metadata.duration,
        satelliteSystems: Array.from(metadata.satelliteSystems),
        observationTypes: Array.from(metadata.observationTypes),
      },
    });
    
    // Associer le fichier à la mission si nécessaire
    if (missionId && filePath) {
      await fileSyncManager.associateFileWithEntity({
        filePath,
        entityType: 'mission',
        entityId: missionId,
        metadata: {
          type: 'rinex',
          version: header.version,
          gnssType: header.gnssType,
          startTime: metadata.startTime?.toISOString(),
          endTime: metadata.endTime?.toISOString(),
        },
      });
    }
  }
  
  /**
   * Calcule les statistiques DOP (Dilution of Precision)
   */
  public calculateDop(observations: RinexObservation[]): {
    gdop: number[]; // Geometric DOP
    pdop: number[]; // Position DOP
    hdop: number[]; // Horizontal DOP
    vdop: number[]; // Vertical DOP
    tdop: number[]; // Time DOP
  } {
    // Implémentation simplifiée du calcul DOP
    // Dans une implémentation réelle, cela nécessiterait des calculs de géométrie des satellites
    const result = {
      gdop: [] as number[],
      pdop: [] as number[],
      hdop: [] as number[],
      vdop: [] as number[],
      tdop: [] as number[],
    };
    
    for (const obs of observations) {
      // Exemple simplifié - à remplacer par un véritable calcul DOP
      const satCount = Object.keys(obs.observations).length;
      const hdop = satCount > 4 ? 1.0 + Math.random() * 2.0 : 5.0 + Math.random() * 5.0;
      const vdop = hdop * (1.0 + Math.random() * 0.5);
      const pdop = Math.sqrt(hdop * hdop + vdop * vdop);
      const tdop = 1.0 + Math.random() * 0.5;
      const gdop = Math.sqrt(pdop * pdop + tdop * tdop);
      
      result.hdop.push(hdop);
      result.vdop.push(vdop);
      result.pdop.push(pdop);
      result.tdop.push(tdop);
      result.gdop.push(gdop);
    }
    
    return result;
  }
  
  /**
   * Convertit les observations RINEX en positions (solution de navigation)
   * Note: Cette méthode est un exemple simplifié
   */
  public async calculatePositions(observations: RinexObservation[]): Promise<{
    timestamp: number;
    lat: number;
    lon: number;
    alt: number;
    hdop: number;
    vdop: number;
    pdop: number;
    satCount: number;
  }[]> {
    // Implémentation simplifiée - dans une application réelle, cela nécessiterait
    // des calculs de positionnement par satellites et des éphémérides
    
    const positions = [];
    const dop = this.calculateDop(observations);
    
    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i];
      const satCount = Object.keys(obs.observations).length;
      
      // Positionnement simplifié - à remplacer par un véritable algorithme de positionnement
      positions.push({
        timestamp: obs.timestamp,
        lat: 48.8566 + (Math.random() * 0.01 - 0.005), // Autour de Paris
        lon: 2.3522 + (Math.random() * 0.01 - 0.005),
        alt: 100 + (Math.random() * 20 - 10),
        hdop: dop.hdop[i] || 1.5,
        vdop: dop.vdop[i] || 2.0,
        pdop: dop.pdop[i] || 2.5,
        satCount,
      });
    }
    
    return positions;
  }
  
  /**
   * Exporte les données RINEX vers d'autres formats
   */
  public async exportToFormat(data: any, format: 'GPX' | 'KML' | 'GEOJSON'): Promise<string> {
    switch (format) {
      case 'GPX':
        return this.exportToGpx(data);
      case 'KML':
        return this.exportToKml(data);
      case 'GEOJSON':
        return this.exportToGeoJson(data);
      default:
        throw new Error(`Format d'export non pris en charge: ${format}`);
    }
  }
  
  private async exportToGpx(data: any): Promise<string> {
    // Implémentation simplifiée
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    gpx += `<gpx version="1.1" creator="CadastreIA" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    gpx += `  <trk>\n`;
    gpx += `    <name>RINEX Track</name>\n`;
    gpx += `    <trkseg>\n`;
    
    if (Array.isArray(data)) {
      for (const point of data) {
        gpx += `      <trkpt lat="${point.lat}" lon="${point.lon}">\n`;
        if (point.alt !== undefined) {
          gpx += `        <ele>${point.alt}</ele>\n`;
        }
        if (point.timestamp) {
          gpx += `        <time>${new Date(point.timestamp).toISOString()}</time>\n`;
        }
        gpx += `      </trkpt>\n`;
      }
    }
    
    gpx += `    </trkseg>\n`;
    gpx += `  </trk>\n`;
    gpx += `</gpx>`;
    
    return gpx;
  }
  
  private async exportToKml(data: any): Promise<string> {
    // Implémentation simplifiée
    let kml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    kml += `<kml xmlns="http://www.opengis.net/kml/2.2">\n`;
    kml += `  <Document>\n`;
    kml += `    <name>RINEX Track</name>\n`;
    kml += `    <Placemark>\n`;
    kml += `      <name>Track</name>\n`;
    kml += `      <LineString>\n`;
    kml += `        <extrude>1</extrude>\n`;
    kml += `        <tessellate>1</tessellate>\n`;
    kml += `        <altitudeMode>absolute</altitudeMode>\n`;
    kml += `        <coordinates>\n`;
    
    if (Array.isArray(data)) {
      for (const point of data) {
        kml += `          ${point.lon},${point.lat},${point.alt || 0}\n`;
      }
    }
    
    kml += `        </coordinates>\n`;
    kml += `      </LineString>\n`;
    kml += `    </Placemark>\n`;
    kml += `  </Document>\n`;
    kml += `</kml>`;
    
    return kml;
  }
  
  private async exportToGeoJson(data: any): Promise<string> {
    // Implémentation simplifiée
    const geojson = {
      type: 'FeatureCollection',
      features: [] as any[],
    };
    
    if (Array.isArray(data)) {
      // Ajouter la ligne
      geojson.features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: data.map(p => [p.lon, p.lat, p.alt || 0]),
        },
        properties: {
          name: 'RINEX Track',
          description: 'Exported from RINEX data',
        },
      });
      
      // Ajouter les points
      geojson.features.push(...data.map((p, i) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.lon, p.lat, p.alt || 0],
        },
        properties: {
          name: `Point ${i + 1}`,
          timestamp: p.timestamp,
          hdop: p.hdop,
          vdop: p.vdop,
          pdop: p.pdop,
          satCount: p.satCount,
        },
      })));
    }
    
    return JSON.stringify(geojson, null, 2);
  }
}

export const rinexParser = RinexParser.getInstance();
export type { RinexHeader, RinexObservation };
