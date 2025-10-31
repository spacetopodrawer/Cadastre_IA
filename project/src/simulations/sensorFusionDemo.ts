import { GNSSFormatManager } from '$lib/sensors/GNSSFormatManager';
import { fusionAuditLog } from '$lib/sensors/FusionAuditLog';
import { calibrationProfiles, calibratePosition } from '$lib/sensors/CalibrationProtocol';
import { sensorFusion } from '$lib/sensors/SensorFusion';

// Simulate data acquisition
const simulateGNSS = () => ({
  latitude: 3.866 + (Math.random() * 0.001 - 0.0005), // Add small random variation
  longitude: 11.521 + (Math.random() * 0.001 - 0.0005),
  altitude: 720 + (Math.random() * 2 - 1),
  accuracy: 1.5 + Math.random() * 3, // 1.5-4.5m accuracy
  timestamp: new Date(),
  source: 'RTCM',
  hdop: 0.8 + Math.random() * 0.5,
  vdop: 1.0 + Math.random() * 0.8,
  satellites: 8 + Math.floor(Math.random() * 6)
});

const simulateIMU = () => ({
  acceleration: [
    0.01 + (Math.random() * 0.02 - 0.01),
    -0.02 + (Math.random() * 0.02 - 0.01),
    9.81 + (Math.random() * 0.2 - 0.1)
  ],
  gyroscope: [
    0.001 + (Math.random() * 0.002 - 0.001),
    0.002 + (Math.random() * 0.002 - 0.001),
    0.003 + (Math.random() * 0.002 - 0.001)
  ],
  timestamp: new Date()
});

const simulateOCR = () => ({
  text: 'Parcelle ' + (100 + Math.floor(Math.random() * 900)),
  classification: 'parcel',
  confidence: 85 + Math.floor(Math.random() * 15), // 85-99% confidence
  position: {
    lat: 3.866 + (Math.random() * 0.0005 - 0.00025), // Tighter variation than GNSS
    lon: 11.521 + (Math.random() * 0.0005 - 0.00025),
    accuracy: 0.5 + Math.random() * 0.5 // 0.5-1.0m accuracy
  },
  timestamp: new Date()
});

// Reference position for calibration
const REFERENCE_POSITION = {
  lat: 3.8662,
  lon: 11.5215,
  alt: 720.5
};

// Main simulation function
async function runSimulation() {
  console.log('🚀 Starting Sensor Fusion Simulation\n');
  
  // 1. Simulate data acquisition
  console.log('🔍 Step 1: Data Acquisition');
  const gnssData = simulateGNSS();
  const imuData = simulateIMU();
  const ocrData = simulateOCR();
  
  console.log('📡 GNSS Data:', {
    position: `${gnssData.latitude.toFixed(6)}, ${gnssData.longitude.toFixed(6)}`,
    altitude: `${gnssData.altitude.toFixed(1)}m`,
    accuracy: `${gnssData.accuracy.toFixed(1)}m`,
    satellites: gnssData.satellites
  });
  
  console.log('🔄 IMU Data:', {
    acceleration: imuData.acceleration.map(v => v.toFixed(4)),
    gyroscope: imuData.gyroscope.map(v => v.toFixed(6))
  });
  
  console.log('📝 OCR Data:', {
    text: ocrData.text,
    confidence: `${ocrData.confidence}%`,
    position: `${ocrData.position.lat.toFixed(6)}, ${ocrData.position.lon.toFixed(6)}`
  });
  
  // 2. Fuse the data
  console.log('\n🧠 Step 2: Data Fusion');
  const fused = await sensorFusion.fuse(gnssData, imuData, ocrData);
  
  console.log('✅ Fused Position:', {
    position: `${fused.latitude.toFixed(6)}, ${fused.longitude.toFixed(6)}`,
    altitude: `${fused.altitude?.toFixed(1) || 'N/A'}m`,
    accuracy: `${fused.accuracy.toFixed(2)}m`,
    sources: fused.sources.join(', ')
  });
  
  // 3. Calibration
  console.log('\n📐 Step 3: Calibration');
  const calibrationProfile = 'high_precision';
  const calibrated = calibratePosition(fused, calibrationProfile);
  
  console.log('🔧 Applied Calibration Profile:', calibrationProfile);
  console.log('📏 Before Calibration:', {
    lat: fused.latitude.toFixed(6),
    lon: fused.longitude.toFixed(6),
    accuracy: `${fused.accuracy.toFixed(2)}m`
  });
  
  console.log('🎯 After Calibration:', {
    lat: calibrated.latitude.toFixed(6),
    lon: calibrated.longitude.toFixed(6),
    accuracy: `${calibrated.accuracy.toFixed(2)}m`,
    offset: {
      lat: (calibrated.latitude - fused.latitude).toFixed(6),
      lon: (calibrated.longitude - fused.longitude).toFixed(6)
    }
  });
  
  // 4. Log the fusion result
  console.log('\n📝 Step 4: Logging');
  const logEntry = await fusionAuditLog.log({
    timestamp: new Date(),
    position: {
      lat: calibrated.latitude,
      lon: calibrated.longitude,
      alt: calibrated.altitude
    },
    accuracy: calibrated.accuracy,
    sources: calibrated.sources,
    status: 'calibrated',
    calibrationProfile: calibrationProfile,
    ocrAnchor: {
      text: ocrData.text,
      confidence: ocrData.confidence,
      classification: ocrData.classification
    },
    metadata: {
      simulation: true,
      gnssAccuracy: gnssData.accuracy,
      imuStability: Math.random().toFixed(2)
    }
  });
  
  console.log('📊 Logged entry with ID:', logEntry);
  
  // 5. Export the data
  console.log('\n📤 Step 5: Export');
  const trackPoints = [
    { 
      lat: calibrated.latitude, 
      lon: calibrated.longitude, 
      alt: calibrated.altitude,
      time: new Date(),
      speed: 0.5 + Math.random() * 0.5, // 0.5-1.0 m/s
      heading: Math.random() * 360,
      accuracy: calibrated.accuracy
    }
  ];
  
  // Generate a few more points for the track
  for (let i = 0; i < 5; i++) {
    const prev = trackPoints[trackPoints.length - 1];
    const distance = 0.0001 * (i + 1); // ~10m between points
    const angle = (prev.heading || 0) * (Math.PI / 180);
    
    trackPoints.push({
      lat: prev.lat + Math.sin(angle) * distance,
      lon: prev.lon + Math.cos(angle) * distance,
      alt: prev.alt! + (Math.random() * 0.5 - 0.25), // Small altitude change
      time: new Date(prev.time.getTime() + 2000), // 2 seconds between points
      speed: 0.5 + Math.random() * 0.5,
      heading: (prev.heading || 0) + (Math.random() * 10 - 5), // Slight heading change
      accuracy: Math.max(0.5, prev.accuracy! * (0.9 + Math.random() * 0.2)) // Slight accuracy change
    });
  }
  
  // Export to GPX
  const gpxContent = GNSSFormatManager.toGPX(trackPoints);
  console.log('📁 GPX Export (first 200 chars):', gpxContent.substring(0, 200) + '...');
  
  // Export to GeoJSON
  const geojsonContent = GNSSFormatManager.toGeoJSON(
    trackPoints.map((pt, idx) => ({
      lat: pt.lat,
      lon: pt.lon,
      alt: pt.alt,
      props: {
        id: idx + 1,
        time: pt.time.toISOString(),
        speed: pt.speed,
        heading: pt.heading,
        accuracy: pt.accuracy
      }
    }))
  );
  
  console.log('📁 GeoJSON Export (first 200 chars):', geojsonContent.substring(0, 200) + '...');
  
  // Generate NMEA sentences
  const nmeaSentences = trackPoints
    .map(pt => ({
      ...pt,
      speed: pt.speed! * 1.94384, // Convert m/s to knots for NMEA
      course: pt.heading
    }))
    .map(GNSSFormatManager.toNMEAGGA);
  
  console.log('📡 NMEA Sentences (first 2):', nmeaSentences.slice(0, 2));
  
  // Log the export
  const exportId = `export-${Date.now()}`;
  await fusionAuditLog.addExportReference(logEntry, exportId);
  
  console.log('\n✅ Simulation Complete!');
  console.log('   - Track points:', trackPoints.length);
  console.log('   - Log entry ID:', logEntry);
  console.log('   - Export ID:', exportId);
  
  // Return the results for further inspection if needed
  return {
    gnssData,
    imuData,
    ocrData,
    fused,
    calibrated,
    trackPoints,
    gpxContent,
    geojsonContent,
    nmeaSentences,
    logEntryId: logEntry,
    exportId
  };
}

// Run the simulation if this file is executed directly
if (require.main === module) {
  runSimulation().catch(console.error);
}

export { runSimulation };
