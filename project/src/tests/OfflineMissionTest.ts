import { DroneMissionPlanner } from '../lib/mission/DroneMissionPlanner';
import { missionSync } from '../lib/sync/MissionSync';
import { OfflineMapRenderer } from '../lib/map/OfflineMapRenderer';
import { SensorFusion } from '../lib/fusion/SensorFusion';
import { CoordinateSystemManager } from '../lib/geospatial/CoordinateSystemManager';
import { CalibrationProtocol } from '../lib/calibration/CalibrationProtocol';
import { fusionAuditLog } from '../lib/security/FusionAuditLog';

/**
 * Test complet d'une mission drone en mode hors ligne
 */
async function runOfflineMissionTest() {
  console.log('🚀 Démarrage du test de mission hors ligne');
  
  try {
    // 1. Création de la mission
    console.log('1. Création de la mission...');
    const mission = DroneMissionPlanner.createMission(
      'Zone Borne 45',
      60, // altitude (m)
      'high', // résolution
      5, // cadence (secondes)
      'drone-001' // ID du drone
    );
    
    // Sauvegarde en mode hors ligne
    await missionSync.saveMission({ 
      ...mission, 
      tileSourceId: 'local-orthophoto-2025',
      status: 'draft',
      timestamp: Date.now(),
      synced: false
    });
    
    console.log('✅ Mission enregistrée en local:', mission.id);

    // 2. Affichage de la carte locale
    console.log('\n2. Affichage de la carte locale...');
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) {
      console.warn('Conteneur de carte non trouvé, création d\'un conteneur de test');
      const div = document.createElement('div');
      div.id = 'map-container';
      div.style.width = '800px';
      div.style.height = '600px';
      document.body.appendChild(div);
    }

    // Configuration des données de test
    const gnssData = [
      { 
        lat: 3.866, 
        lon: 11.521, 
        timestamp: Date.now(),
        accuracy: 1.2,
        altitude: 720,
        speed: 0
      }
    ];

    const ocrData = [
      { 
        lat: 3.866, 
        lon: 11.521, 
        timestamp: Date.now(),
        text: 'Borne 45',
        confidence: 93,
        bbox: [0, 0, 100, 50]
      }
    ];

    // Rendu de la carte avec les données
    OfflineMapRenderer.renderOfflineMap('map-container', 'local-orthophoto-2025', [
      { type: 'GNSS', data: gnssData },
      { type: 'OCR', data: ocrData }
    ]);

    console.log('✅ Carte hors ligne affichée avec les données de test');

    // 3. Simulation de capture GNSS + OCR
    console.log('\n3. Simulation des capteurs...');
    const gnssReading = { 
      lat: 3.866, 
      lon: 11.521, 
      alt: 720, 
      timestamp: Date.now(), 
      source: 'RTCM',
      accuracy: 1.2,
      speed: 0,
      heading: 0
    };

    const ocrReading = { 
      text: 'Borne 45', 
      classification: 'layer', 
      confidence: 93, 
      timestamp: Date.now(),
      bbox: [0, 0, 100, 50],
      imageData: null
    };

    // Fusion des données des capteurs
    const fusedData = SensorFusion.fuse(gnssReading, null, ocrReading);
    console.log('✅ Données fusionnées:', JSON.stringify(fusedData, null, 2));

    // 4. Projection + calibration
    console.log('\n4. Projection et calibration...');
    const projectedCoords = CoordinateSystemManager.fromWGS84(
      fusedData.position.lat, 
      fusedData.position.lon, 
      'EPSG:32632'
    );

    const profile = CalibrationProtocol.list()[0];
    const correctedData = CalibrationProtocol.apply(profile, {
      ...fusedData,
      position: projectedCoords
    });

    console.log('✅ Données projetées et calibrées:', JSON.stringify(correctedData, null, 2));

    // 5. Audit de la mission
    console.log('\n5. Journalisation des données...');
    await fusionAuditLog.record({
      timestamp: Date.now(),
      missionId: mission.id,
      fusedPosition: correctedData.position,
      orientation: correctedData.orientation || { roll: 0, pitch: 0, yaw: 0 },
      accuracy: correctedData.accuracy || 1.0,
      sources: correctedData.sources || ['GNSS', 'OCR'],
      projection: 'EPSG:32632',
      calibrationProfile: profile.name,
      correctionSource: 'RTCM',
      exportedAs: 'GeoJSON',
      metadata: {
        altitude: gnssReading.alt,
        confidence: ocrReading.confidence,
        deviceId: 'drone-001'
      }
    });

    console.log('✅ Données enregistrées dans le journal d\'audit');

    // 6. Simulation de la synchronisation
    console.log('\n6. Configuration de la synchronisation...');
    missionSync.autoSync();
    
    // Simulation d'un retour en ligne après 5 secondes
    setTimeout(async () => {
      console.log('\n🔌 Simulation du retour en ligne...');
      window.dispatchEvent(new Event('online'));
      
      // Vérification de la synchronisation
      setTimeout(async () => {
        const status = await missionSync.getSyncStatus();
        console.log('🔄 État de la synchronisation:', status);
        
        const unsynced = missionSync.getUnsyncedCount();
        console.log(`📊 Missions en attente de synchronisation: ${unsynced}`);
        
        if (unsynced === 0) {
          console.log('✅ Toutes les données ont été synchronisées avec succès!');
        } else {
          console.warn('⚠️ Certaines données n\'ont pas pu être synchronisées');
        }
      }, 2000);
    }, 5000);

  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  }
}

// Exécution du test
if (import.meta.hot) {
  // Configuration pour Vite HMR
  import.meta.hot.accept(() => {
    console.log('Mise à jour du module de test');
  });
}

export { runOfflineMissionTest };
