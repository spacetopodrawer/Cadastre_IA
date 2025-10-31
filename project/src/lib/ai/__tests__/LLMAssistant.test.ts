import { describe, it, expect, vi, beforeEach } from 'vitest';
import { llmAssistant, type GNSSFormat, type PositionFix, type FixQuality } from '../LLMAssistant';
import { fusionAuditLog } from '../../security/FusionAuditLog';
import { missionSync } from '../../sync/MissionSync';

// Mock des dépendances
vi.mock('../../security/FusionAuditLog');
vi.mock('../../sync/MissionSync');

// Données de test
const TEST_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="CadastreIA" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Test Track</name>
    <trkseg>
      <trkpt lat="3.866000" lon="11.521000">
        <ele>125.5</ele>
        <time>2025-10-30T15:00:00Z</time>
        <hdop>1.2</hdop>
        <sat>8</sat>
      </trkpt>
      <trkpt lat="3.866500" lon="11.521500">
        <ele>126.0</ele>
        <time>2025-10-30T15:01:00Z</time>
        <hdop>1.5</hdop>
        <sat>9</sat>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

const TEST_NMEA = [
  '$GPGGA,150000.00,03866.00000,N,01152.10000,E,4,08,0.9,125.5,M,46.9,M,,*47',
  '$GPGGA,150100.00,03866.50000,N,01152.15000,E,4,09,1.0,126.0,M,46.9,M,,*48'
].join('\n');

const TEST_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [11.521, 3.866, 125.5]
      },
      properties: {
        timestamp: 1730298000000,
        quality: 'RTK',
        hdop: 1.2
      }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [11.5215, 3.8665, 126.0]
      },
      properties: {
        timestamp: 1730298060000,
        quality: 'RTK',
        hdop: 1.5
      }
    }
  ]
};

describe('LLMAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Configurer un mock pour la mission courante
    (missionSync.getCurrentMission as any).mockReturnValue({
      id: 'test-mission-123',
      name: 'Test Mission'
    });
  });

  describe('parseGPX', () => {
    it('should parse valid GPX with waypoints', () => {
      const fixes = llmAssistant['parseGPX'](TEST_GPX);
      
      expect(fixes).toHaveLength(2);
      expect(fixes[0]).toMatchObject({
        lat: 3.866,
        lon: 11.521,
        alt: 125.5,
        hdop: 1.2,
        source: 'GPX',
        metadata: {
          satCount: 8
        }
      });
      
      // Vérifier que le timestamp a été correctement parsé
      expect(fixes[0].timestamp).toBe(new Date('2025-10-30T15:00:00Z').getTime());
    });

    it('should handle missing optional elements', () => {
      const minimalGPX = `
        <gpx><trk><trkseg>
          <trkpt lat="3.866" lon="11.521">
            <time>2025-10-30T15:00:00Z</time>
          </trkpt>
        </trkseg></trk></gpx>
      `;
      
      const fixes = llmAssistant['parseGPX'](minimalGPX);
      expect(fixes).toHaveLength(1);
      expect(fixes[0]).toMatchObject({
        lat: 3.866,
        lon: 11.521,
        timestamp: new Date('2025-10-30T15:00:00Z').getTime()
      });
      // Les champs optionnels ne devraient pas être présents
      expect(fixes[0].alt).toBeUndefined();
      expect(fixes[0].hdop).toBeUndefined();
    });

    it('should throw on invalid XML', () => {
      const invalidGPX = '<gpx><trk><trkseg><trkpt></gpx>';
      expect(() => llmAssistant['parseGPX'](invalidGPX)).toThrow('Erreur de parsing GPX');
    });
  });

  describe('parseNMEA', () => {
    it('should parse NMEA GGA sentences', () => {
      const fixes = llmAssistant['parseNMEA'](TEST_NMEA);
      
      expect(fixes).toHaveLength(2);
      expect(fixes[0]).toMatchObject({
        lat: 3.8666666666666663,
        lon: 11.868333333333334,
        alt: 125.5,
        hdop: 0.9,
        quality: 'RTK',
        source: 'NMEA',
        metadata: {
          satCount: 8,
          fixType: 'RTK Fixed'
        }
      });
    });

    it('should handle different fix qualities', () => {
      const nmeaSingle = '$GPGGA,150000.00,03866.00000,N,01152.10000,E,1,08,0.9,125.5,M,46.9,M,,*47';
      const nmeaDGPS = '$GPGGA,150000.00,03866.00000,N,01152.10000,E,2,08,0.9,125.5,M,46.9,M,,*47';
      
      const singleFix = llmAssistant['parseNMEA'](nmeaSingle)[0];
      const dgpsFix = llmAssistant['parseNMEA'](nmeaDGPS)[0];
      
      expect(singleFix.quality).toBe('Single');
      expect(dgpsFix.quality).toBe('DGPS');
    });

    it('should ignore invalid NMEA sentences', () => {
      const invalidNMEA = 'INVALID NMEA STRING\n' + TEST_NMEA;
      const fixes = llmAssistant['parseNMEA'](invalidNMEA);
      expect(fixes).toHaveLength(2); // Seules les lignes GGA valides sont conservées
    });
  });

  describe('parseGeoJSON', () => {
    it('should parse GeoJSON FeatureCollection', () => {
      const fixes = llmAssistant['parseGeoJSON'](JSON.stringify(TEST_GEOJSON));
      
      expect(fixes).toHaveLength(2);
      expect(fixes[0]).toMatchObject({
        lat: 3.866,
        lon: 11.521,
        alt: 125.5,
        source: 'GeoJSON',
        metadata: {
          timestamp: 1730298000000,
          quality: 'RTK',
          hdop: 1.2,
          geometryType: 'Point'
        }
      });
    });

    it('should handle LineString geometry', () => {
      const lineStringGeoJSON = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [11.521, 3.866, 125.5],
            [11.5215, 3.8665, 126.0],
            [11.522, 3.867, 126.5]
          ]
        },
        properties: {
          name: 'Test Line',
          timestamp: 1730298000000
        }
      };
      
      const fixes = llmAssistant['parseGeoJSON'](JSON.stringify(lineStringGeoJSON));
      expect(fixes).toHaveLength(3);
      expect(fixes[0].metadata?.geometryType).toBe('LineString');
      expect(fixes[0].metadata?.pointIndex).toBe(0);
      expect(fixes[1].timestamp).toBe(1730298000000 + 30000); // 30s après le premier point
    });
  });

  describe('generatePositionReport', () => {
    const testFixes: PositionFix[] = [
      {
        lat: 3.866,
        lon: 11.521,
        alt: 125.5,
        timestamp: 1730298000000, // 15:00:00
        hdop: 1.2,
        vdop: 2.0,
        pdop: 2.3,
        quality: 'RTK',
        source: 'GPX'
      },
      {
        lat: 3.8665,
        lon: 11.5215,
        alt: 126.0,
        timestamp: 1730298060000, // 15:01:00 (1 minute plus tard)
        hdop: 1.5,
        vdop: 2.2,
        pdop: 2.7,
        quality: 'RTK',
        source: 'GPX'
      },
      {
        lat: 3.867,
        lon: 11.522,
        alt: 126.5,
        timestamp: 1730298120000, // 15:02:00 (2 minutes après le début)
        hdop: 1.8,
        vdop: 2.5,
        pdop: 3.1,
        quality: 'Float',
        source: 'GPX'
      }
    ];

    it('should generate a report with correct statistics', () => {
      const report = llmAssistant['generatePositionReport'](testFixes, {
        missionId: 'test-mission-123',
        coordinateSystem: 'WGS84'
      });

      expect(report).toMatchObject({
        missionId: 'test-mission-123',
        startTime: 1730298000000,
        endTime: 1730298120000,
        summary: {
          duration: 120000, // 2 minutes
          fixCount: 3,
          fixRate: 0.025, // 3 points / 120 secondes
          dominantMode: 'RTK',
          coordinateSystem: 'WGS84'
        }
      });

      // Vérifier les calculs de distance et vitesse
      // Distance approximative entre les points: ~78.6m (2D) ou ~78.8m (3D)
      expect(report.summary.distance).toBeCloseTo(157.2, 0); // Somme des deux segments
      expect(report.summary.avgSpeed).toBeCloseTo(0.655, 2); // m/s
      
      // Vérifier les moyennes DOP
      expect(report.summary.avgHdop).toBeCloseTo(1.5, 1);
      expect(report.summary.avgVdop).toBeCloseTo(2.23, 1);
      expect(report.summary.avgPdop).toBeCloseTo(2.7, 1);
      
      // Vérifier l'estimation de précision
      expect(report.summary.accuracyEstimate).toBeGreaterThan(0);
    });

    it('should handle empty fix array', () => {
      expect(() => llmAssistant['generatePositionReport']([], {})).toThrow(
        'Impossible de générer un rapport sans points de position'
      );
    });

    it('should handle single fix', () => {
      const singleFix = [testFixes[0]];
      const report = llmAssistant['generatePositionReport'](singleFix, {});
      
      expect(report.summary.duration).toBe(0);
      expect(report.summary.distance).toBe(0);
      expect(report.summary.avgSpeed).toBe(0);
    });
  });

  describe('exportToGeoJSON', () => {
    it('should export fixes to valid GeoJSON', async () => {
      const testFixes: PositionFix[] = [
        {
          lat: 3.866,
          lon: 11.521,
          alt: 125.5,
          timestamp: 1730298000000,
          hdop: 1.2,
          quality: 'RTK',
          source: 'GPX',
          metadata: {
            satCount: 8
          }
        }
      ];

      const geoJSON = JSON.parse(await llmAssistant.exportToGeoJSON(testFixes));
      
      expect(geoJSON).toMatchObject({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [11.521, 3.866, 125.5]
            },
            properties: {
              index: 0,
              timestamp: 1730298000000,
              quality: 'RTK',
              hdop: 1.2,
              satCount: 8
            }
          }
        ]
      });
    });
  });

  describe('importGNSSFromFile', () => {
    it('should parse and process a GPX file', async () => {
      const file = new File([TEST_GPX], 'test_track.gpx', { type: 'application/gpx+xml' });
      
      const report = await llmAssistant.importGNSSFromFile(file);
      
      // Vérifier que le rapport a été généré correctement
      expect(report.fixes).toHaveLength(2);
      expect(report.missionId).toBe('test-mission-123');
      
      // Vérifier que l'audit a été enregistré
      expect(fusionAuditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'gnss_import',
          entityType: 'mission',
          entityId: 'test-mission-123',
          details: expect.any(Object)
        })
      );
    });

    it('should handle file read errors', async () => {
      // Simuler une erreur de lecture de fichier
      const mockFile = new File([''], 'test.gpx', { type: 'application/gpx+xml' });
      
      // Remplacer la méthode text() pour qu'elle échoue
      Object.defineProperty(mockFile, 'text', {
        value: () => Promise.reject(new Error('Erreur de lecture du fichier'))
      });
      
      await expect(llmAssistant.importGNSSFromFile(mockFile)).rejects.toThrow(
        'Échec du parsing du fichier GNSS (GPX): Erreur de lecture du fichier'
      );
    });
  });

  describe('utility functions', () => {
    it('should calculate distance correctly', () => {
      // Distance approximative entre Paris et Lyon: ~392 km
      const paris = { lat: 48.8566, lon: 2.3522 };
      const lyon = { lat: 45.7640, lon: 4.8357 };
      
      const distance = llmAssistant['calculateDistance'](
        paris.lat, paris.lon,
        lyon.lat, lyon.lon
      );
      
      expect(distance / 1000).toBeCloseTo(392, 0); // À ~1km près
    });

    it('should determine dominant fix mode', () => {
      const fixes: PositionFix[] = [
        { lat: 0, lon: 0, timestamp: 0, quality: 'RTK', source: 'GPX' },
        { lat: 0, lon: 0, timestamp: 0, quality: 'RTK', source: 'GPX' },
        { lat: 0, lon: 0, timestamp: 0, quality: 'Single', source: 'GPX' },
        { lat: 0, lon: 0, timestamp: 0, quality: 'RTK', source: 'GPX' },
        { lat: 0, lon: 0, timestamp: 0, quality: 'Float', source: 'GPX' }
      ];
      
      const dominantMode = llmAssistant['getDominantFixMode'](fixes);
      expect(dominantMode).toBe('RTK');
    });
  });
});
