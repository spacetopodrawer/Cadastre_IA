<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { sensorFusion } from '$lib/sensors/SensorFusion';
  import { imuReader } from '$lib/sensors/IMUReader';
  import { CalibrationProtocol } from '$lib/sensors/CalibrationProtocol';
  import type { FusedPosition, IMUData } from '$lib/sensors/SensorFusion';
  import { Download, Compass, MapPin, Crosshair, RotateCcw, AlertTriangle } from 'lucide-svelte';
  
  export let autoCenter = true;
  
  let position: FusedPosition | null = null;
  let imuData: IMUData | null = null;
  let isCalibrating = false;
  let calibrationProgress = 0;
  let lastError: string | null = null;
  
  // Subscribe to position updates
  const unsubscribePosition = sensorFusion.on('positionUpdate', (pos: FusedPosition) => {
    position = pos;
  });
  
  // Subscribe to IMU updates
  const unsubscribeImu = imuReader.on('update', (data: IMUData) => {
    imuData = data;
  });
  
  // Start sensors when component mounts
  onMount(() => {
    sensorFusion.start();
    imuReader.start();
    
    // Try to load saved calibration
    const savedCalibration = localStorage.getItem('imuCalibration');
    if (savedCalibration) {
      try {
        imuReader.setCalibrationData(JSON.parse(savedCalibration));
      } catch (e) {
        console.error('Failed to load IMU calibration:', e);
      }
    }
  });
  
  // Clean up on unmount
  onDestroy(() => {
    unsubscribePosition();
    unsubscribeImu();
  });
  
  // Format coordinates for display
  function formatCoordinate(coord: number, isLat: boolean): string {
    const abs = Math.abs(coord);
    const deg = Math.floor(abs);
    const min = (abs - deg) * 60;
    const dir = isLat ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
    return `${deg}°${min.toFixed(4)}' ${dir}`;
  }
  
  // Format accuracy with units
  function formatAccuracy(accuracy: number): string {
    if (accuracy < 1) {
      return `${(accuracy * 100).toFixed(0)} cm`;
    }
    return `${accuracy.toFixed(1)} m`;
  }
  
  // Format timestamp
  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }
  
  // Start calibration process
  async function startCalibration() {
    if (isCalibrating) return;
    
    isCalibrating = true;
    calibrationProgress = 0;
    
    // Show calibration instructions
    alert('Hold the device in a stable position and keep it still. Calibration will take about 10 seconds.');
    
    // Start calibration
    imuReader.startCalibration();
    
    // Update progress
    const interval = setInterval(() => {
      calibrationProgress += 5;
      if (calibrationProgress >= 100) {
        clearInterval(interval);
        isCalibrating = false;
        
        // Save calibration
        const calibration = imuReader.getCalibrationData();
        localStorage.setItem('imuCalibration', JSON.stringify(calibration));
        
        alert('Calibration complete!');
      }
    }, 500);
  }
  
  // Export position as GeoJSON
  function exportGeoJSON() {
    if (!position) return;
    
    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [position.position.lon, position.position.lat, position.position.alt || 0]
      },
      properties: {
        accuracy: position.accuracy,
        sources: position.sources,
        timestamp: position.timestamp,
        orientation: position.orientation
      }
    };
    
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `position_${position.timestamp}.geojson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  // Export position as GPX
  function exportGPX() {
    if (!position) return;
    
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cadastre_IA"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Position</name>
    <time>${new Date(position.timestamp).toISOString()}</time>
  </metadata>
  <wpt lat="${position.position.lat}" lon="${position.position.lon}">
    <ele>${position.position.alt || 0}</ele>
    <time>${new Date(position.timestamp).toISOString()}</time>
    <name>Position</name>
    <desc>Accuracy: ${position.accuracy}m, Sources: ${position.sources.join(', ')}</desc>
  </wpt>
</gpx>`;
    
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `position_${position.timestamp}.gpx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  // Export position as NMEA
  function exportNMEA() {
    if (!position) return;
    
    // Simple NMEA GGA sentence (for demonstration)
    const toNmeaDegrees = (deg: number, isLongitude: boolean): string => {
      const absDeg = Math.abs(deg);
      const degrees = Math.floor(absDeg);
      const minutes = (absDeg - degrees) * 60;
      const direction = isLongitude ? (deg >= 0 ? 'E' : 'W') : (deg >= 0 ? 'N' : 'S');
      return `${degrees.toString().padStart(isLongitude ? 3 : 2, '0')}${minutes.toFixed(4).padStart(7, '0')},${direction}`;
    };
    
    const time = new Date(position.timestamp);
    const timeStr = [
      time.getUTCHours().toString().padStart(2, '0'),
      time.getUTCMinutes().toString().padStart(2, '0'),
      time.getUTCSeconds().toString().padStart(2, '0'),
      '.',
      time.getUTCMilliseconds().toString().padStart(3, '0').substring(0, 2)
    ].join('');
    
    const latNmea = toNmeaDegrees(position.position.lat, false);
    const lonNmea = toNmeaDegrees(position.position.lon, true);
    
    // GGA - Global Positioning System Fix Data
    const gga = [
      'GPGGA',
      timeStr,
      latNmea.split(',')[0],
      latNmea.split(',')[1],
      lonNmea.split(',')[0],
      lonNmea.split(',')[1],
      '1', // Fix quality (0=invalid, 1=GPS fix, 2=DGPS fix, etc.)
      '08', // Number of satellites
      (position.accuracy / 5).toFixed(1), // HDOP (estimated)
      (position.position.alt || 0).toFixed(1), // Altitude
      'M', // Altitude units (Meters)
      '0.0', // Height of geoid above WGS84 ellipsoid
      'M', // Geoid height units
      '', // Time since last DGPS update
      '0000' // DGPS reference station ID
    ];
    
    // Calculate checksum
    const sentence = `$${gga.join(',')}`;
    let checksum = 0;
    for (let i = 1; i < sentence.length; i++) {
      checksum ^= sentence.charCodeAt(i);
    }
    
    const nmea = `${sentence}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`;
    
    const blob = new Blob([nmea], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `position_${position.timestamp}.nmea`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
</script>

<div class="position-manager">
  <div class="header">
    <h2><MapPin size={20} /> Position</h2>
    <div class="actions">
      <button 
        class="btn btn-icon" 
        class:active={isCalibrating}
        on:click={startCalibration}
        title="Calibrate IMU"
      >
        <RotateCcw size={16} />
        {#if isCalibrating}
          <span class="calibration-progress" style={`width: ${calibrationProgress}%`}></span>
        {/if}
      </button>
      <div class="dropdown">
        <button class="btn btn-icon" title="Export">
          <Download size={16} />
        </button>
        <div class="dropdown-content">
          <a href="#" on:click|preventDefault={exportGeoJSON}>GeoJSON</a>
          <a href="#" on:click|preventDefault={exportGPX}>GPX</a>
          <a href="#" on:click|preventDefault={exportNMEA}>NMEA</a>
        </div>
      </div>
    </div>
  </div>
  
  {#if !position}
    <div class="no-data">
      <p>Acquiring position...</p>
      <div class="spinner"></div>
    </div>
  {:else}
    <div class="position-info">
      <div class="coordinates">
        <div class="coordinate">
          <span class="label">Latitude:</span>
          <span class="value">{formatCoordinate(position.position.lat, true)}</span>
        </div>
        <div class="coordinate">
          <span class="label">Longitude:</span>
          <span class="value">{formatCoordinate(position.position.lon, false)}</span>
        </div>
        {#if position.position.alt !== undefined}
          <div class="coordinate">
            <span class="label">Altitude:</span>
            <span class="value">{position.position.alt.toFixed(1)} m</span>
          </div>
        {/if}
      </div>
      
      <div class="metadata">
        <div class="metadata-item">
          <span class="label">Accuracy:</span>
          <span class="value">
            {formatAccuracy(position.accuracy)}
            {position.accuracy > 10 && <AlertTriangle size={14} class="warning-icon" />}
          </span>
        </div>
        <div class="metadata-item">
          <span class="label">Time:</span>
          <span class="value">{formatTime(position.timestamp)}</span>
        </div>
        <div class="metadata-item">
          <span class="label">Sources:</span>
          <span class="sources">
            {#each position.sources as source}
              <span class="source-tag">{source}</span>
            {/each}
          </span>
        </div>
      </div>
      
      {#if position.orientation}
        <div class="orientation">
          <h3>Orientation</h3>
          <div class="compass">
            <div 
              class="compass-arrow" 
              style={`transform: rotate(${position.orientation.yaw}rad)`}
            ></div>
          </div>
          <div class="orientation-values">
            <div class="orientation-value">
              <span class="label">Pitch:</span>
              <span class="value">
                {((position.orientation.pitch * 180) / Math.PI).toFixed(1)}°
              </span>
            </div>
            <div class="orientation-value">
              <span class="label">Roll:</span>
              <span class="value">
                {((position.orientation.roll * 180) / Math.PI).toFixed(1)}°
              </span>
            </div>
            <div class="orientation-value">
              <span class="label">Yaw:</span>
              <span class="value">
                {((position.orientation.yaw * 180) / Math.PI).toFixed(1)}°
              </span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
  
  {#if lastError}
    <div class="error">
      <AlertTriangle size={16} />
      <span>{lastError}</span>
    </div>
  {/if}
</div>

<style>
  .position-manager {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    font-family: var(--font-sans);
    max-width: 100%;
    overflow: hidden;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color);
  }
  
  h2, h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  h3 {
    font-size: 1rem;
    margin-top: 1rem;
  }
  
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  
  .btn {
    background: var(--btn-bg);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: all 0.2s ease;
  }
  
  .btn:hover {
    background: var(--btn-hover-bg);
  }
  
  .btn:active {
    transform: translateY(1px);
  }
  
  .btn-icon {
    padding: 0.4rem;
    border-radius: 50%;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .btn.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary-dark);
  }
  
  .dropdown {
    position: relative;
    display: inline-block;
  }
  
  .dropdown-content {
    display: none;
    position: absolute;
    right: 0;
    background: var(--bg-primary);
    min-width: 120px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    z-index: 1;
    overflow: hidden;
  }
  
  .dropdown:hover .dropdown-content {
    display: block;
  }
  
  .dropdown-content a {
    color: var(--text);
    padding: 0.5rem 1rem;
    text-decoration: none;
    display: block;
    font-size: 0.9rem;
  }
  
  .dropdown-content a:hover {
    background: var(--bg-hover);
  }
  
  .no-data {
    padding: 2rem 0;
    text-align: center;
    color: var(--text-secondary);
  }
  
  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid var(--border-color);
    border-top-color: var(--primary);
    border-radius: 50%;
    margin: 1rem auto;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .coordinates {
    margin-bottom: 1rem;
  }
  
  .coordinate {
    display: flex;
    margin-bottom: 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.95rem;
  }
  
  .label {
    color: var(--text-secondary);
    min-width: 80px;
    margin-right: 0.5rem;
  }
  
  .value {
    font-weight: 500;
  }
  
  .metadata {
    background: var(--bg-tertiary);
    border-radius: 6px;
    padding: 0.8rem;
    margin: 1rem 0;
  }
  
  .metadata-item {
    display: flex;
    margin-bottom: 0.4rem;
    font-size: 0.9rem;
  }
  
  .metadata-item:last-child {
    margin-bottom: 0;
  }
  
  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  
  .source-tag {
    background: var(--primary-light);
    color: var(--primary-dark);
    padding: 0.1rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .orientation {
    margin-top: 1.5rem;
  }
  
  .compass {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      #f44336 0% 90deg,
      #4caf50 90deg 180deg,
      #2196f3 180deg 270deg,
      #ff9800 270deg 360deg
    );
    margin: 0 auto 1rem;
    position: relative;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .compass-arrow {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 2px;
    height: 50%;
    background: white;
    transform-origin: bottom center;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
  }
  
  .compass-arrow::before {
    content: '';
    position: absolute;
    top: 0;
    left: -4px;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 10px solid white;
    transform: translateX(-50%);
  }
  
  .orientation-values {
    display: flex;
    justify-content: space-around;
    margin-top: 1rem;
  }
  
  .orientation-value {
    text-align: center;
  }
  
  .orientation-value .label {
    display: block;
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-bottom: 0.2rem;
  }
  
  .orientation-value .value {
    font-family: var(--font-mono);
    font-size: 1rem;
  }
  
  .error {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 0.5rem;
    border-radius: 4px;
    margin-top: 1rem;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .warning-icon {
    color: #ff9800;
    margin-left: 0.3rem;
  }
  
  .calibration-progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--primary);
    transition: width 0.5s ease;
  }
  
  .btn-icon {
    position: relative;
    overflow: hidden;
  }
  
  /* Responsive adjustments */
  @media (max-width: 480px) {
    .position-manager {
      padding: 0.75rem;
    }
    
    .coordinates, .metadata {
      font-size: 0.9rem;
    }
    
    .orientation-values {
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .compass {
      width: 100px;
      height: 100px;
    }
  }
</style>
