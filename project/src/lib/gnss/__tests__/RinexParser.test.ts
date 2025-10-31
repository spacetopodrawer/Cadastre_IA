import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rinexParser, type RinexHeader, type RinexObservation } from '../RinexParser';
import { fusionAuditLog } from '../../security/FusionAuditLog';
import { fileSyncManager } from '../../sync/FileSyncManager';

// Mock des dépendances
vi.mock('../../security/FusionAuditLog');
vi.mock('../../sync/FileSyncManager');

// Exemple de fichier RINEX 3.03 simplifié
const SAMPLE_RINEX_3_03 = `     3.03           OBSERVATION DATA    M (MIXED)           RINEX VERSION / TYPE
Convert2RINEX 3.4.1                   20240101 000000     PGM / RUN BY / DATE 
EXAMPLE OBSERVATION SITE                COMMENT             
                                                            MARKER NAME         
12345A01                                                   MARKER NUMBER       
GEODETIC    WGS84                       COMMENT             
                                                            MARKER TYPE        
OBSERVER / AGENCY              
REC # / TYPE / VERS                 12345           RECEIVER INFO     
ANT # / TYPE                       ANTENNA TYPE     
  1234567.1234  123456.1234  1234.1234                  APPROX POSITION XYZ  
        0.0000        0.0000        0.0000                  ANTENNA: DELTA H/E/N
G    4 C1C L1C D1C S1C                                    SYS / # / OBS TYPES 
R    4 C1C L1C D1C S1C                                    SYS / # / OBS TYPES 
E    4 C1C L1C D1C S1C                                    SYS / # / OBS TYPES 
C    4 C1C L1C D1C S1C                                    SYS / # / OBS TYPES 
    30.000                                                  INTERVAL          
  2024     1     1     0     0    0.0000000     GPS         TIME OF FIRST OBS 
  2024     1     1    23    59   59.0000000     GPS         TIME OF LAST OBS  
  2024     1     1     0     0    0.0000000     GPS         TIME OF FIRST OBS 
  2024     1     1    23    59   59.0000000     GPS         TIME OF LAST OBS  
  2024     1     1     0     0    0.0000000     GPS         TIME OF FIRST OBS 
  2024     1     1    23    59   59.0000000     GPS         TIME OF LAST OBS  
  2024     1     1     0     0    0.0000000     GPS         TIME OF FIRST OBS 
  2024     1     1    23    59   59.0000000     GPS         TIME OF LAST OBS  
     0                                                      LEAP SECONDS      
                                                            END OF HEADER     
> 2024 01 01 00 00 00.0000000  0 12
G01G02G03G04G05G06G07G08G09G10G11G12
G01  123456789.123    12345678.123      1234.123      30   
G02  234567890.234    23456789.234      2345.234      32   
G03  345678901.345    34567890.345      3456.345      34  n> 2024 01 01 00 00 30.0000000  0 12
G01G02G03G04G05G06G07G08G09G10G11G12
G01  123456789.123    12345678.123      1234.123      30   
G02  234567890.234    23456789.234      2345.234      32   
G03  345678901.345    34567890.345      3456.345      34   `;

describe('RinexParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseRinexFile', () => {
    it('should parse a valid RINEX 3.03 file', async () => {
      const result = await rinexParser.parseRinexFile(SAMPLE_RINEX_3_03, {
        missionId: 'test-mission-123',
        filePath: '/path/to/file.24o'
      });

      // Vérifier l'en-tête
      expect(result.header.version).toBe('3.03');
      expect(result.header.fileType).toBe('OBSERVATION');
      expect(result.header.gnssType).toBe('MIXED');
      expect(result.header.markerName).toBe('EXAMPLE OBSERVATION SITE');
      expect(result.header.receiverInfo).toBeDefined();
      expect(result.header.antennaInfo).toBeDefined();
      expect(result.header.positionApprox).toEqual([1234567.1234, 123456.1234, 1234.1234]);
      expect(result.header.observationTypes).toBeDefined();
      expect(result.header.interval).toBe(30);
      expect(result.header.leapSeconds).toBe(0);

      // Vérifier les observations
      expect(result.observations.length).toBe(2);
      expect(result.observations[0].satellites).toContain('G01');
      expect(result.observations[0].observations['G01']).toBeDefined();

      // Vérifier les métadonnées
      expect(result.metadata.fileSize).toBeGreaterThan(0);
      expect(result.metadata.satelliteSystems.size).toBeGreaterThan(0);
      expect(result.metadata.observationTypes.size).toBeGreaterThan(0);
      expect(result.metadata.startTime).toBeInstanceOf(Date);
      expect(result.metadata.endTime).toBeInstanceOf(Date);
      expect(result.metadata.duration).toBeGreaterThan(0);

      // Vérifier que l'audit a été enregistré
      expect(fusionAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'rinex_import',
          entityType: 'mission',
          entityId: 'test-mission-123',
          details: expect.objectContaining({
            filePath: '/path/to/file.24o',
            version: '3.03',
            fileType: 'OBSERVATION',
            gnssType: 'MIXED'
          })
        })
      );

      // Vérifier que le fichier a été associé à la mission
      expect(fileSyncManager.associateFileWithEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/path/to/file.24o',
          entityType: 'mission',
          entityId: 'test-mission-123',
          metadata: expect.objectContaining({
            type: 'rinex',
            version: '3.03',
            gnssType: 'MIXED'
          })
        })
      );
    });

    it('should handle invalid RINEX content', async () => {
      await expect(
        rinexParser.parseRinexFile('INVALID RINEX CONTENT')
      ).rejects.toThrow('En-tête RINEX invalide');
    });
  });

  describe('calculateDop', () => {
    it('should calculate DOP values', async () => {
      const { observations } = await rinexParser.parseRinexFile(SAMPLE_RINEX_3_03);
      const dop = rinexParser.calculateDop(observations);
      
      expect(dop).toHaveProperty('gdop');
      expect(dop).toHaveProperty('pdop');
      expect(dop).toHaveProperty('hdop');
      expect(dop).toHaveProperty('vdop');
      expect(dop).toHaveProperty('tdop');
      
      // Vérifier que nous avons le bon nombre de valeurs
      expect(dop.gdop.length).toBe(observations.length);
      expect(dop.pdop.length).toBe(observations.length);
      expect(dop.hdop.length).toBe(observations.length);
      expect(dop.vdop.length).toBe(observations.length);
      expect(dop.tdop.length).toBe(observations.length);
      
      // Vérifier que les valeurs sont raisonnables
      for (let i = 0; i < observations.length; i++) {
        expect(dop.hdop[i]).toBeGreaterThan(0);
        expect(dop.vdop[i]).toBeGreaterThanOrEqual(dop.hdop[i]);
        expect(dop.pdop[i]).toBeCloseTo(Math.sqrt(dop.hdop[i] ** 2 + dop.vdop[i] ** 2), 5);
      }
    });
  });

  describe('calculatePositions', () => {
    it('should calculate positions from observations', async () => {
      const { observations } = await rinexParser.parseRinexFile(SAMPLE_RINEX_3_03);
      const positions = await rinexParser.calculatePositions(observations);
      
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(observations.length);
      
      // Vérifier la structure des positions
      for (const pos of positions) {
        expect(pos).toHaveProperty('timestamp');
        expect(pos).toHaveProperty('lat');
        expect(pos).toHaveProperty('lon');
        expect(pos).toHaveProperty('alt');
        expect(pos).toHaveProperty('hdop');
        expect(pos).toHaveProperty('vdop');
        expect(pos).toHaveProperty('pdop');
        expect(pos).toHaveProperty('satCount');
        
        // Vérifier que les coordonnées sont dans des plages raisonnables
        expect(pos.lat).toBeGreaterThanOrEqual(-90);
        expect(pos.lat).toBeLessThanOrEqual(90);
        expect(pos.lon).toBeGreaterThanOrEqual(-180);
        expect(pos.lon).toBeLessThanOrEqual(180);
      }
    });
  });

  describe('exportToFormat', () => {
    let testPositions: any[];
    
    beforeEach(async () => {
      const { observations } = await rinexParser.parseRinexFile(SAMPLE_RINEX_3_03);
      testPositions = await rinexParser.calculatePositions(observations);
    });
    
    it('should export to GPX format', async () => {
      const gpx = await rinexParser.exportToFormat(testPositions, 'GPX');
      
      expect(gpx).toContain('<?xml');
      expect(gpx).toContain('<gpx');
      expect(gpx).toContain('<trk>');
      expect(gpx).toContain('</gpx>');
      
      // Vérifier que les points sont inclus
      for (const pos of testPositions) {
        expect(gpx).toContain(`lat="${pos.lat}"`);
        expect(gpx).toContain(`lon="${pos.lon}"`);
      }
    });
    
    it('should export to KML format', async () => {
      const kml = await rinexParser.exportToFormat(testPositions, 'KML');
      
      expect(kml).toContain('<?xml');
      expect(kml).toContain('<kml');
      expect(kml).toContain('<LineString>');
      expect(kml).toContain('</kml>');
    });
    
    it('should export to GeoJSON format', async () => {
      const geojson = await rinexParser.exportToFormat(testPositions, 'GEOJSON');
      const parsed = JSON.parse(geojson);
      
      expect(parsed).toHaveProperty('type', 'FeatureCollection');
      expect(Array.isArray(parsed.features)).toBe(true);
      expect(parsed.features.length).toBeGreaterThan(0);
      
      // Vérifier qu'il y a une LineString et des Points
      const lineString = parsed.features.find((f: any) => f.geometry.type === 'LineString');
      const points = parsed.features.filter((f: any) => f.geometry.type === 'Point');
      
      expect(lineString).toBeDefined();
      expect(points.length).toBe(testPositions.length);
    });
    
    it('should throw error for unsupported format', async () => {
      await expect(
        rinexParser.exportToFormat(testPositions, 'UNSUPPORTED' as any)
      ).rejects.toThrow("Format d'export non pris en charge");
    });
  });

  describe('parseEpochHeader', () => {
    it('should parse epoch header line', () => {
      const line = '> 2024 01 01 12 34 56.7890000  0 12';
      const epoch = (rinexParser as any).parseEpochHeader(line);
      
      expect(epoch).toEqual({
        year: 2024,
        month: 1,
        day: 1,
        hour: 12,
        minute: 34,
        second: 56.789,
        epochFlag: 0,
        satelliteCount: 12,
      });
    });
    
    it('should handle receiver clock offset', () => {
      const line = '> 2024 01 01 12 34 56.7890000  0 12     123.456789012';
      const epoch = (rinexParser as any).parseEpochHeader(line);
      
      expect(epoch.receiverClockOffset).toBeCloseTo(123.456789012);
    });
  });

  describe('convertToTimestamp', () => {
    it('should convert RINEX date to timestamp', () => {
      const timestamp = (rinexParser as any).convertToTimestamp(2024, 1, 1, 12, 34, 56.789);
      const date = new Date(timestamp);
      
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0); // 0-based
      expect(date.getUTCDate()).toBe(1);
      expect(date.getUTCHours()).toBe(12);
      expect(date.getUTCMinutes()).toBe(34);
      expect(date.getUTCSeconds()).toBe(56);
      expect(date.getUTCMilliseconds()).toBe(789);
    });
    
    it('should handle 2-digit years', () => {
      // Année 2020
      let timestamp = (rinexParser as any).convertToTimestamp(20, 1, 1, 0, 0, 0);
      expect(new Date(timestamp).getUTCFullYear()).toBe(2020);
      
      // Année 1999
      timestamp = (rinexParser as any).convertToTimestamp(99, 1, 1, 0, 0, 0);
      expect(new Date(timestamp).getUTCFullYear()).toBe(1999);
    });
  });
});
