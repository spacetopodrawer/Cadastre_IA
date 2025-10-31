<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { writable, derived } from 'svelte/store';
  import { GNSSFormatManager } from '$lib/sensors/GNSSFormatManager';
  import { sensorFusion, type GNSSData, type FusedPosition } from '$lib/sensors/SensorFusion';
  import { calibrationProfiles, calibratePosition } from '$lib/sensors/CalibrationProtocol';
  import { saveAs } from 'file-saver';
  import { Download, Upload, MapPin, Compass, Target, Ruler, Map, Layers, Settings, AlertCircle } from 'lucide-svelte';
  
  // State
  const currentPosition = writable<FusedPosition | null>(null);
  const trackHistory = writable<Array<FusedPosition & { timestamp: number }>>([]);
  const isRecording = writable(false);
  const selectedExportFormat = writable('gpx');
  const mapCenter = writable<[number, number] | null>(null);
  const zoomLevel = writable(15);
  const selectedCalibrationProfile = writable('default');
  const showCalibrationSettings = writable(false);
  const positionAccuracy = writable<number | null>(null);
  const lastUpdateTime = writable<Date | null>(null);
  const connectionStatus = writable<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const errorMessage = writable<string | null>(null);
  
  // Derived stores
  const positionString = derived(currentPosition, $pos => {
    if (!$pos) return 'No position data';
    return `${pos.latitude.toFixed(6)}, ${pos.longitude.toFixed(6)}`;
  });
  
  const altitudeString = derived(currentPosition, $pos => {
    if ($pos?.altitude === undefined) return 'N/A';
    return `${$pos.altitude.toFixed(1)} m`;
  });
  
  const speedString = derived(currentPosition, $pos => {
    if ($pos?.speed === undefined) return 'N/A';
    return `${($pos.speed * 3.6).toFixed(1)} km/h`; // Convert m/s to km/h
  });
  
  const headingString = derived(currentPosition, $pos => {
    if ($pos?.heading === undefined) return 'N/A';
    return `${Math.round($pos.heading)}°`;
  });
  
  const accuracyString = derived(positionAccuracy, $acc => {
    if ($acc === null) return 'N/A';
    return `${$acc.toFixed(1)} m`;
  });
  
  const satellitesString = derived(currentPosition, $pos => {
    if ($pos?.satellites === undefined) return 'N/A';
    return $pos.satellites.toString();
  });
  
  const lastUpdateString = derived(lastUpdateTime, $time => {
    if (!$time) return 'Never';
    return $time.toLocaleTimeString();
  });
  
  // Methods
  const startRecording = () => {
    trackHistory.set([]);
    isRecording.set(true);
  };
  
  const stopRecording = () => {
    isRecording.set(false);
  };
  
  const clearTrack = () => {
    trackHistory.set([]);
  };
  
  const exportTrack = () => {
    const $trackHistory = trackHistory;
    const format = selectedExportFormat;
    
    if ($trackHistory.length === 0) {
      errorMessage.set('No track data to export');
      return;
    }
    
    try {
      let content: string;
      let extension: string;
      
      switch (format) {
        case 'gpx':
          content = GNSSFormatManager.toGPX(
            $trackHistory.map(pos => ({
              lat: pos.latitude,
              lon: pos.longitude,
              alt: pos.altitude,
              time: new Date(pos.timestamp)
            }))
          );
          extension = 'gpx';
          break;
          
        case 'geojson':
          content = GNSSFormatManager.toGeoJSON(
            $trackHistory.map((pos, index) => ({
              lat: pos.latitude,
              lon: pos.longitude,
              alt: pos.altitude,
              props: {
                timestamp: new Date(pos.timestamp).toISOString(),
                speed: pos.speed,
                heading: pos.heading,
                accuracy: pos.accuracy,
                satellites: pos.satellites,
                index
              }
            }))
          );
          extension = 'geojson';
          break;
          
        case 'kml':
          // Simple KML export - could be enhanced with more features
          const coordinates = $trackHistory
            .map(pos => `${pos.longitude},${pos.latitude}${pos.altitude !== undefined ? ',' + pos.altitude : ''}`)
            .join(' ');
            
          content = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Track</name>
    <Placemark>
      <name>Track</name>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${coordinates}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
          extension = 'kml';
          break;
          
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      saveAs(blob, `track-${timestamp}.${extension}`);
      
    } catch (err) {
      console.error('Error exporting track:', err);
      errorMessage.set(`Export failed: ${err.message}`);
    }
  };
  
  const importTrack = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        
        // Try to detect format based on content
        if (file.name.endsWith('.gpx') || content.includes('<gpx')) {
          const points = GNSSFormatManager.parseGPX(content);
          const track = points.map((point, index) => ({
            latitude: point.lat,
            longitude: point.lon,
            altitude: point.ele,
            speed: point.speed,
            heading: point.course,
            accuracy: point.hdop ? point.hdop * 5 : undefined, // Approximate HDOP to meters
            satellites: point.sat,
            timestamp: point.time ? new Date(point.time).getTime() : Date.now() - (points.length - index) * 1000,
            source: 'import',
            corrected: false
          }));
          
          trackHistory.set(track);
          
          // Update map view to show imported track
          if (track.length > 0) {
            const firstPoint = track[0];
            mapCenter.set([firstPoint.latitude, firstPoint.longitude]);
          }
          
        } else if (file.name.endsWith('.geojson') || content.trim().startsWith('{')) {
          // Handle GeoJSON import
          const geojson = JSON.parse(content);
          if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
            const track = geojson.features
              .filter((f: any) => f.geometry && f.geometry.type === 'Point')
              .map((feature: any, index: number) => ({
                latitude: feature.geometry.coordinates[1],
                longitude: feature.geometry.coordinates[0],
                altitude: feature.geometry.coordinates[2],
                speed: feature.properties?.speed,
                heading: feature.properties?.heading,
                accuracy: feature.properties?.accuracy,
                satellites: feature.properties?.satellites,
                timestamp: feature.properties?.timestamp 
                  ? new Date(feature.properties.timestamp).getTime() 
                  : Date.now() - (geojson.features.length - index) * 1000,
                source: 'import',
                corrected: false
              }));
              
            trackHistory.set(track);
            
            if (track.length > 0) {
              const firstPoint = track[0];
              mapCenter.set([firstPoint.latitude, firstPoint.longitude]);
            }
          }
        } else {
          throw new Error('Unsupported file format');
        }
      } catch (err) {
        console.error('Error importing track:', err);
        errorMessage.set(`Import failed: ${err.message}`);
      }
    };
    
    reader.onerror = () => {
      errorMessage.set('Failed to read file');
    };
    
    reader.readAsText(file);
  };
  
  const applyCalibration = () => {
    const $currentPosition = currentPosition;
    const $selectedCalibrationProfile = selectedCalibrationProfile;
    
    if (!$currentPosition) {
      errorMessage.set('No position data available for calibration');
      return;
    }
    
    try {
      const calibrated = calibratePosition(
        $currentPosition,
        $selectedCalibrationProfile
      );
      
      currentPosition.set({
        ...$currentPosition,
        ...calibrated,
        corrected: true
      });
      
    } catch (err) {
      console.error('Calibration failed:', err);
      errorMessage.set(`Calibration failed: ${err.message}`);
    }
  };
  
  const resetCalibration = () => {
    currentPosition.update(pos => {
      if (!pos) return pos;
      const { offsetX, offsetY, offsetZ, corrected, ...rest } = pos;
      return rest;
    });
  };
  
  // Event handlers
  const handlePositionUpdate = (pos: FusedPosition) => {
    currentPosition.set(pos);
    lastUpdateTime.set(new Date());
    
    if (isRecording) {
      trackHistory.update(history => [
        ...history,
        { ...pos, timestamp: Date.now() }
      ]);
    }
    
    // Update map center if not set or if following position
    if (!mapCenter) {
      mapCenter.set([pos.latitude, pos.longitude]);
    }
  };
  
  const handleConnectionStatusChange = (status: 'disconnected' | 'connecting' | 'connected') => {
    connectionStatus.set(status);
  };
  
  const handleError = (error: Error) => {
    console.error('Sensor error:', error);
    errorMessage.set(error.message);
  };
  
  // Lifecycle
  onMount(() => {
    // Subscribe to sensor fusion updates
    const unsubscribePosition = sensorFusion.on('position', handlePositionUpdate);
    const unsubscribeStatus = sensorFusion.on('status', handleConnectionStatusChange);
    const unsubscribeError = sensorFusion.on('error', handleError);
    
    // Start sensor fusion
    sensorFusion.start();
    
    return () => {
      // Cleanup
      unsubscribePosition();
      unsubscribeStatus();
      unsubscribeError();
      sensorFusion.stop();
    };
  });
  
  // Clear error message after timeout
  $: if ($errorMessage) {
    const timer = setTimeout(() => {
      errorMessage.set(null);
    }, 5000);
    
    return () => clearTimeout(timer);
  }
</script>

<div class="position-manager">
  <!-- Header with title and status -->
  <div class="header">
    <h2><MapPin class="icon" /> Position Manager</h2>
    <div class="status-badge" class:connected={$connectionStatus === 'connected'}>
      {#if $connectionStatus === 'connected'}
        <span class="status-dot"></span> Connected
      {:else if $connectionStatus === 'connecting'}
        <span class="status-dot connecting"></span> Connecting...
      {:else}
        <span class="status-dot disconnected"></span> Disconnected
      {/if}
    </div>
  </div>
  
  <!-- Error message -->
  {#if $errorMessage}
    <div class="error-message">
      <AlertCircle size={16} />
      <span>{$errorMessage}</span>
    </div>
  {/if}
  
  <!-- Main content -->
  <div class="content">
    <!-- Position display -->
    <div class="position-card">
      <div class="position-coords">
        <div class="coord">
          <span class="label">Latitude:</span>
          <span class="value">
            {#if $currentPosition}
              {$currentPosition.latitude.toFixed(6)}°
              {#if $currentPosition.corrected}
                <span class="correction-badge" title="Position has been corrected">Calibrated</span>
              {/if}
            {:else}
              --
            {/if}
          </span>
        </div>
        <div class="coord">
          <span class="label">Longitude:</span>
          <span class="value">
            {#if $currentPosition}
              {$currentPosition.longitude.toFixed(6)}°
            {:else}
              --
            {/if}
          </span>
        </div>
        <div class="coord">
          <span class="label">Altitude:</span>
          <span class="value">{$altitudeString}</span>
        </div>
      </div>
      
      <div class="position-stats">
        <div class="stat">
          <Compass size={16} />
          <span>{$headingString}</span>
        </div>
        <div class="stat">
          <Target size={16} />
          <span>{$speedString}</span>
        </div>
        <div class="stat">
          <Ruler size={16} />
          <span>Accuracy: {$accuracyString}</span>
        </div>
        <div class="stat">
          <Layers size={16} />
          <span>Satellites: {$satellitesString}</span>
        </div>
      </div>
      
      <div class="position-actions">
        <button 
          class="btn" 
          class:recording={$isRecording}
          on:click={() => $isRecording ? stopRecording() : startRecording()}
        >
          {#if $isRecording}
            <span class="recording-dot"></span> Stop Recording
          {:else}
            <span class="record-icon"></span> Record Track
          {/if}
        </button>
        
        <button 
          class="btn secondary" 
          on:click={clearTrack}
          disabled={$trackHistory.length === 0}
        >
          Clear Track
        </button>
        
        <div class="calibration-controls">
          <select 
            bind:value={$selectedCalibrationProfile}
            class="select"
          >
            {#each Object.keys(calibrationProfiles) as profile}
              <option value={profile}>
                {profile === 'default' ? 'Default Calibration' : profile}
              </option>
            {/each}
          </select>
          
          <button 
            class="btn secondary" 
            on:click={applyCalibration}
            disabled={!$currentPosition}
          >
            Apply Calibration
          </button>
          
          <button 
            class="btn secondary" 
            on:click={resetCalibration}
            disabled={!$currentPosition?.corrected}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
    
    <!-- Map container -->
    <div class="map-container">
      <!-- Map implementation would go here -->
      <div class="map-placeholder">
        <Map size={48} />
        <p>Map View</p>
        <div class="coordinates">
          <span>Center: {$mapCenter ? `${$mapCenter[0].toFixed(6)}, ${$mapCenter[1].toFixed(6)}` : 'Not set'}</span>
          <span>Zoom: {$zoomLevel}x</span>
        </div>
      </div>
      
      <!-- Map controls -->
      <div class="map-controls">
        <button class="btn map-btn" title="Zoom in">+</button>
        <button class="btn map-btn" title="Zoom out">−</button>
        <button class="btn map-btn" title="Center on position">⌖</button>
      </div>
    </div>
    
    <!-- Track info and export -->
    <div class="track-info">
      <h3>Track Information</h3>
      
      <div class="track-stats">
        <div class="stat">
          <span class="label">Points:</span>
          <span class="value">{$trackHistory.length}</span>
        </div>
        <div class="stat">
          <span class="label">Last Update:</span>
          <span class="value">{$lastUpdateString}</span>
        </div>
        <div class="stat">
          <span class="label">Status:</span>
          <span class="value">
            {#if $isRecording}
              <span class="recording">Recording</span>
            {:else}
              <span class="paused">Paused</span>
            {/if}
          </span>
        </div>
      </div>
      
      <div class="export-controls">
        <div class="export-format">
          <label for="export-format">Format:</label>
          <select id="export-format" bind:value={$selectedExportFormat}>
            <option value="gpx">GPX</option>
            <option value="geojson">GeoJSON</option>
            <option value="kml">KML</option>
          </select>
        </div>
        
        <button 
          class="btn" 
          on:click={exportTrack}
          disabled={$trackHistory.length === 0}
        >
          <Download size={16} />
          Export Track
        </button>
        
        <label class="btn secondary" for="import-track">
          <Upload size={16} />
          Import Track
          <input 
            id="import-track" 
            type="file" 
            accept=".gpx,.geojson,.kml"
            on:change={importTrack}
            style="display: none;"
          />
        </label>
      </div>
    </div>
  </div>
  
  <!-- Status bar -->
  <div class="status-bar">
    <span>Position: {$positionString}</span>
    <span>Last Update: {$lastUpdateString}</span>
    <span>Points: {$trackHistory.length}</span>
  </div>
</div>

<style>
  .position-manager {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f5f5f5;
    color: #333;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background-color: #2c3e50;
    color: white;
  }
  
  .header h2 {
    margin: 0;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    background-color: rgba(255, 255, 255, 0.1);
    font-size: 0.875rem;
  }
  
  .status-dot {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background-color: #2ecc71;
  }
  
  .status-dot.connecting {
    background-color: #f39c12;
    animation: pulse 1.5s infinite;
  }
  
  .status-dot.disconnected {
    background-color: #e74c3c;
  }
  
  .connected {
    color: #2ecc71;
  }
  
  .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background-color: #fdecea;
    color: #d32f2f;
    font-size: 0.875rem;
    border-left: 4px solid #f44336;
    margin: 0 1rem;
    border-radius: 0 0 4px 4px;
  }
  
  .content {
    flex: 1;
    padding: 1rem;
    display: grid;
    grid-template-columns: 1fr 2fr;
    grid-template-rows: auto 1fr;
    gap: 1rem;
    overflow: hidden;
  }
  
  .position-card {
    grid-row: 1;
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .position-coords {
    margin-bottom: 1.5rem;
  }
  
  .coord {
    margin-bottom: 0.75rem;
  }
  
  .label {
    display: inline-block;
    width: 80px;
    color: #666;
    font-size: 0.9rem;
  }
  
  .value {
    font-family: 'Roboto Mono', monospace;
    font-size: 1rem;
    color: #2c3e50;
  }
  
  .correction-badge {
    display: inline-block;
    background-color: #e3f2fd;
    color: #1976d2;
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 1rem;
    margin-left: 0.5rem;
    vertical-align: middle;
  }
  
  .position-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 1rem 0;
    border-top: 1px solid #eee;
    border-bottom: 1px solid #eee;
  }
  
  .stat {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  
  .position-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .btn:hover {
    background-color: #2980b9;
  }
  
  .btn:disabled {
    background-color: #bdc3c7;
    cursor: not-allowed;
  }
  
  .btn.secondary {
    background-color: #ecf0f1;
    color: #2c3e50;
  }
  
  .btn.secondary:hover {
    background-color: #d5dbdb;
  }
  
  .recording-dot {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background-color: #e74c3c;
    animation: pulse 1.5s infinite;
    margin-right: 0.25rem;
  }
  
  .record-icon {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background-color: #e74c3c;
    margin-right: 0.25rem;
  }
  
  .btn.recording {
    background-color: #e74c3c;
  }
  
  .btn.recording:hover {
    background-color: #c0392b;
  }
  
  .calibration-controls {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .select {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  
  .map-container {
    grid-row: 1 / span 2;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
  }
  
  .map-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #7f8c8d;
    text-align: center;
    padding: 2rem;
  }
  
  .map-placeholder p {
    margin: 1rem 0 0;
    font-size: 1.1rem;
    font-weight: 500;
  }
  
  .coordinates {
    margin-top: 1rem;
    font-size: 0.8rem;
    color: #95a5a6;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .map-controls {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .map-btn {
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    line-height: 1;
  }
  
  .track-info {
    grid-column: 1;
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .track-info h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.1rem;
    color: #2c3e50;
  }
  
  .track-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .track-stats .stat {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #eee;
  }
  
  .track-stats .label {
    color: #7f8c8d;
  }
  
  .track-stats .recording {
    color: #e74c3c;
    font-weight: 500;
  }
  
  .track-stats .paused {
    color: #7f8c8d;
  }
  
  .export-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .export-format {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .export-format label {
    font-size: 0.9rem;
    color: #7f8c8d;
  }
  
  .export-format select {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  
  .status-bar {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background-color: #2c3e50;
    color: #ecf0f1;
    font-size: 0.8rem;
  }
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  
  /* Responsive adjustments */
  @media (max-width: 1024px) {
    .content {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
    }
    
    .map-container {
      grid-column: 1;
      grid-row: 2;
      min-height: 400px;
    }
    
    .track-info {
      grid-column: 1;
      grid-row: 3;
    }
  }
  
  @media (max-width: 600px) {
    .position-stats {
      grid-template-columns: 1fr;
    }
    
    .track-stats {
      grid-template-columns: 1fr;
    }
    
    .calibration-controls {
      flex-direction: column;
    }
    
    .status-bar {
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem;
      font-size: 0.75rem;
    }
  }
</style>
